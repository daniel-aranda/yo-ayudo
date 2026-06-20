import { describe, it, expect, afterAll } from "vitest";
import { rm } from "node:fs/promises";
import { randomUUID as random_uuid } from "node:crypto";
import { store_conversation_media, read_conversation_media } from "../../src/channels/conversation_media_store.js";

const test_dir = `.storage/test-media-${random_uuid()}`;
const local_config = {
  conversation_media_s3_bucket: "",
  conversation_media_s3_prefix: "yoayudo/conversation-media",
  conversation_media_local_dir: test_dir,
  aws_region: "us-east-1",
};

afterAll(async () => {
  await rm(test_dir, { recursive: true, force: true });
});

describe("conversation_media_store", () => {
  it("fallback local sin bucket: store + read round-trip (funciona sin keys)", async () => {
    const buffer = Buffer.from("hello-image-bytes");
    const stored = await store_conversation_media(
      {
        buffer,
        mime_type: "image/png",
        original_filename: "foto.png",
        organization_id: "o1",
        account_id: "a1",
        channel: "whatsapp",
        source_media_id: "media-123",
      },
      { config: local_config },
    );
    expect(stored).toMatchObject({
      provider: "local",
      mime_type: "image/png",
      size_bytes: buffer.length,
      source_media_id: "media-123",
      channel: "whatsapp",
    });
    expect(stored.local_path).toMatch(/\.png$/);

    const read = await read_conversation_media(stored, { config: local_config });
    expect(read.buffer.equals(buffer)).toBe(true);
    expect(read.mime_type).toBe("image/png");
  });

  it("S3 con bucket: usa PutObject (cliente inyectado) + descriptor s3 + read", async () => {
    let put_command;
    const s3_client = {
      send: async (command) => {
        put_command = command;
        return {};
      },
    };
    const s3_config = { ...local_config, conversation_media_s3_bucket: "my-bucket" };
    const stored = await store_conversation_media(
      {
        buffer: Buffer.from("x"),
        mime_type: "application/pdf",
        original_filename: "doc.pdf",
        organization_id: "o1",
        account_id: "a1",
        channel: "whatsapp",
      },
      { config: s3_config, s3_client },
    );
    expect(stored).toMatchObject({ provider: "s3", bucket: "my-bucket", region: "us-east-1", mime_type: "application/pdf" });
    expect(stored.s3_key).toMatch(/^yoayudo\/conversation-media\/organizations\/o1\/accounts\/a1\/whatsapp\/.+\.pdf$/);
    expect(put_command.input.Bucket).toBe("my-bucket");

    const read_client = {
      send: async () => ({ Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) }, ContentType: "application/pdf" }),
    };
    const read = await read_conversation_media(stored, { s3_client: read_client });
    expect(Array.from(read.buffer)).toEqual([1, 2, 3]);
  });
});
