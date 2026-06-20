import express from "express";
import path from "node:path";
import { rmSync as rm_sync } from "node:fs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { handle_whatsapp_webhook_payload } from "../../src/engine/message_processor.js";
import { register_inspector_routes } from "../../src/inspector/inspector_routes.js";
import { navigation_context } from "../../src/app/navigation_middleware.js";
import {
  json_text,
  message_alignment,
  format_phone,
} from "../../src/inspector/inspector_presenter.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { format_money } from "../../src/shared/money.js";
import { format_date_es, format_datetime_es } from "../../src/shared/dates.js";
import { config } from "../../src/app/config.js";
import { create_test_pool } from "../helpers/test_pool.js";

const IMAGE_BYTES = "fake-image-bytes";

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
      buffer: Buffer.from(IMAGE_BYTES),
      mime_type: "image/png",
      source_media_id: media_id,
      original_filename: "foto.png",
      size_bytes: IMAGE_BYTES.length,
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

function create_inspector_test_app(pool) {
  const app = express();
  const router = express.Router();
  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.date = format_date_es;
  app.locals.datetime = format_datetime_es;
  app.locals.json = json_text;
  app.locals.message_alignment = message_alignment;
  app.locals.phone = format_phone;
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(navigation_context);
  register_inspector_routes(router, { pool });
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });
  return app;
}

describe("adjuntos en la vista de conversación + ruta /inspector/media/:id", () => {
  let pool;
  beforeEach(async () => {
    pool = await create_test_pool();
    rm_sync(".storage/test-view-media", { recursive: true, force: true });
  });
  afterEach(async () => {
    await pool?.end();
    rm_sync(".storage/test-view-media", { recursive: true, force: true });
  });

  it("muestra la miniatura en la conversación y la ruta sirve el binario", async () => {
    await handle_whatsapp_webhook_payload(image_payload(config.whatsapp_phone_number_id, "media-view-1"), {
      pool,
      provider: new mock_provider(),
      whatsapp_client: new media_whatsapp_client(),
      memory_store: new local_memory_store({ base_dir: ".storage/test-view-media" }),
    });

    const attachment = (await pool.query("SELECT * FROM message_attachments LIMIT 1")).rows[0];
    expect(attachment).toBeTruthy();
    const conversation = (
      await pool.query("SELECT conversation_id, account_id FROM messages WHERE id = $1", [attachment.message_id])
    ).rows[0];

    const app = create_inspector_test_app(pool);

    // 1) La página de la conversación referencia el adjunto vía la ruta de media.
    const page = await request(app).get(
      `/inspector/accounts/${conversation.account_id}/conversations/${conversation.conversation_id}`,
    );
    expect(page.status).toBe(200);
    expect(page.text).toContain(`/inspector/media/${attachment.id}`);
    expect(page.text).toContain("msg-attachment");

    // 2) La ruta de media sirve el binario con el content-type guardado.
    const media = await request(app).get(`/inspector/media/${attachment.id}`);
    expect(media.status).toBe(200);
    expect(media.headers["content-type"]).toContain("image/png");
    expect(media.body.toString()).toBe(IMAGE_BYTES);

    rm_sync(attachment.local_path, { force: true });
  });

  it("404 cuando el adjunto no existe", async () => {
    const app = create_inspector_test_app(pool);
    const media = await request(app).get("/inspector/media/00000000-0000-0000-0000-000000000000");
    expect(media.status).toBe(404);
  });
});
