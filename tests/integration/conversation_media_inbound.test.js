import { rmSync as rm_sync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { handle_whatsapp_webhook_payload } from "../../src/engine/message_processor.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { create_test_pool } from "../helpers/test_pool.js";
import { config } from "../../src/app/config.js";

class media_whatsapp_client {
  async send_text() {
    return { sent: true, external_message_id: "x", raw_response: {} };
  }
  async send_template() {
    return { sent: false, raw_response: {} };
  }
  async download_media(media_id) {
    return {
      downloaded: true,
      buffer: Buffer.from("fake-image-bytes"),
      mime_type: "image/png",
      source_media_id: media_id,
      original_filename: "foto.png",
      size_bytes: 16,
    };
  }
}

function image_payload(phone_number_id, media_id) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id, display_phone_number: "+525555999999" },
              contacts: [{ wa_id: "5215550000000", profile: { name: "Cliente" } }],
              messages: [
                {
                  from: "5215550000000",
                  id: `media-msg-${media_id}`,
                  timestamp: "1700000000",
                  type: "image",
                  image: { id: media_id, mime_type: "image/png" },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("inbound media → adjunto en S3/local", () => {
  let pool;
  beforeEach(async () => {
    pool = await create_test_pool();
    rm_sync(".storage/test-memory-media", { recursive: true, force: true });
  });
  afterEach(async () => {
    await pool?.end();
    rm_sync(".storage/test-memory-media", { recursive: true, force: true });
  });

  it("descarga el media y crea message_attachments (local sin S3)", async () => {
    await handle_whatsapp_webhook_payload(image_payload(config.whatsapp_phone_number_id, "media-abc"), {
      pool,
      provider: new mock_provider(),
      whatsapp_client: new media_whatsapp_client(),
      memory_store: new local_memory_store({ base_dir: ".storage/test-memory-media" }),
    });

    const rows = (await pool.query("SELECT * FROM message_attachments")).rows;
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      channel: "whatsapp",
      provider: "local",
      mime_type: "image/png",
      source_media_id: "media-abc",
      status: "stored",
    });
    expect(rows[0].local_path).toBeTruthy();
    expect(rows[0].message_id).toBeTruthy();
    rm_sync(rows[0].local_path, { force: true });
  });

  it("sin descarga (downloaded:false) NO crea adjunto ni rompe el inbound", async () => {
    const client = {
      send_text: async () => ({ sent: true, raw_response: {} }),
      send_template: async () => ({}),
      download_media: async () => ({ downloaded: false, reason: "missing_whatsapp_credentials" }),
    };
    const result = await handle_whatsapp_webhook_payload(image_payload(config.whatsapp_phone_number_id, "media-none"), {
      pool,
      provider: new mock_provider(),
      whatsapp_client: client,
      memory_store: new local_memory_store({ base_dir: ".storage/test-memory-media" }),
    });
    expect(Array.isArray(result)).toBe(true);
    expect((await pool.query("SELECT * FROM message_attachments")).rows.length).toBe(0);
  });
});
