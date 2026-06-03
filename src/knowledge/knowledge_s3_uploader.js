import { randomUUID as random_uuid } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../app/config.js";

function safe_path_part(value, fallback) {
  return String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function build_s3_key(input) {
  const prefix = String(config.knowledge_s3_prefix || "yoayudo/knowledge").replace(/^\/+|\/+$/g, "");
  const organization = safe_path_part(input.organization_id, "organization");
  const account = safe_path_part(input.account_id, "account");
  const filename = safe_path_part(input.file.originalname, "document");

  return `${prefix}/organizations/${organization}/accounts/${account}/${random_uuid()}-${filename}`;
}

function s3_not_configured_error() {
  const error = new Error("Configura KNOWLEDGE_S3_BUCKET en .env para subir documentos de knowledge a S3.");
  error.code = "knowledge_s3_not_configured";
  return error;
}

export async function upload_knowledge_document_to_s3(input) {
  if (!config.knowledge_s3_bucket) {
    throw s3_not_configured_error();
  }

  const key = build_s3_key(input);
  const client = new S3Client({ region: config.aws_region });

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.knowledge_s3_bucket,
        Key: key,
        Body: input.file.buffer,
        ContentType: input.file.mimetype || "application/octet-stream",
        Metadata: {
          original_filename: input.file.originalname,
          organization_id: String(input.organization_id ?? ""),
          account_id: String(input.account_id ?? ""),
        },
      }),
    );
  } catch (cause) {
    const error = new Error(`No se pudo subir el documento a S3: ${cause.message}`);
    error.code = "knowledge_s3_upload_failed";
    error.cause = cause;
    throw error;
  }

  return {
    provider: "s3",
    bucket: config.knowledge_s3_bucket,
    key,
    region: config.aws_region,
    original_filename: input.file.originalname,
    mime_type: input.file.mimetype,
    size_bytes: input.file.size,
  };
}
