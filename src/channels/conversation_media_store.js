import { randomUUID as random_uuid } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config as default_config } from "../app/config.js";

// Almacén de archivos adjuntos de conversación. **S3 si hay bucket; si no, local**
// (fallback de dev sin keys — la implementación funciona 100% sin credenciales).
// Channel-agnostic: el `channel` solo segmenta la ruta. `s3_client`/`config` son
// inyectables para tests (sin red).

function safe_part(value, fallback) {
  return (
    String(value ?? fallback)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || fallback
  );
}

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "video/mp4": "mp4",
};

function build_object_key(input, cfg) {
  const prefix = String(cfg.conversation_media_s3_prefix || "yoayudo/conversation-media").replace(/^\/+|\/+$/g, "");
  const org = safe_part(input.organization_id, "organization");
  const account = safe_part(input.account_id, "account");
  const channel = safe_part(input.channel, "whatsapp");
  const ext =
    EXT_BY_MIME[input.mime_type] ||
    (input.original_filename ? path.extname(input.original_filename).replace(/^\./, "") : "") ||
    "bin";
  const base = safe_part(
    input.original_filename ? path.basename(input.original_filename, path.extname(input.original_filename)) : "media",
    "media",
  );
  return `${prefix}/organizations/${org}/accounts/${account}/${channel}/${random_uuid()}-${base}.${ext}`;
}

// Guarda el binario y devuelve el descriptor para `message_attachments`.
export async function store_conversation_media(input, options = {}) {
  const cfg = options.config ?? default_config;
  const key = build_object_key(input, cfg);
  const common = {
    mime_type: input.mime_type ?? null,
    size_bytes: input.buffer?.length ?? null,
    original_filename: input.original_filename ?? null,
    source_media_id: input.source_media_id ?? null,
    channel: input.channel ?? "whatsapp",
  };

  if (cfg.conversation_media_s3_bucket) {
    const client = options.s3_client ?? new S3Client({ region: cfg.aws_region });
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.conversation_media_s3_bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mime_type || "application/octet-stream",
        Metadata: {
          organization_id: String(input.organization_id ?? ""),
          account_id: String(input.account_id ?? ""),
          channel: String(input.channel ?? ""),
        },
      }),
    );
    return { provider: "s3", bucket: cfg.conversation_media_s3_bucket, s3_key: key, region: cfg.aws_region, ...common };
  }

  // Fallback local: misma `key` como ruta relativa bajo el dir configurado.
  const local_path = path.join(process.cwd(), cfg.conversation_media_local_dir, key);
  await mkdir(path.dirname(local_path), { recursive: true });
  await writeFile(local_path, input.buffer);
  return { provider: "local", local_path, ...common };
}

// Lee el binario guardado (para servirlo): S3 GetObject o readFile local.
export async function read_conversation_media(attachment, options = {}) {
  const cfg = options.config ?? default_config;
  if (attachment.provider === "s3") {
    const client = options.s3_client ?? new S3Client({ region: attachment.region ?? cfg.aws_region });
    const result = await client.send(new GetObjectCommand({ Bucket: attachment.bucket, Key: attachment.s3_key }));
    const buffer = Buffer.from(await result.Body.transformToByteArray());
    return { buffer, mime_type: attachment.mime_type ?? result.ContentType ?? "application/octet-stream" };
  }
  const buffer = await readFile(attachment.local_path);
  return { buffer, mime_type: attachment.mime_type ?? "application/octet-stream" };
}
