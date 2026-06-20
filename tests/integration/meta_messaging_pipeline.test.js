import { rmSync as rm_sync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mock_provider } from "../../src/ai/mock_provider.js";
import {
  handle_instagram_webhook_payload,
  handle_messenger_webhook_payload,
} from "../../src/engine/message_processor.js";
import {
  create_simulated_instagram_payload,
  create_simulated_messenger_payload,
} from "../../src/channels/meta_messaging_parser.js";
import {
  resolve_instagram_identity_by_account_id,
  resolve_facebook_identity_by_page_id,
} from "../../src/channels/meta_identity.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { create_test_pool } from "../helpers/test_pool.js";

const IG_ACCOUNT = "demo-yoayudo-instagram-id";
const FB_PAGE = "demo-yoayudo-facebook-page-id";

class fake_messaging_client {
  constructor() {
    this.sent = [];
  }
  async send_text(input) {
    this.sent.push(input);
    return { sent: true, external_message_id: `fake-${this.sent.length}`, raw_response: { ok: true } };
  }
  async download_media(media_url) {
    return { downloaded: true, buffer: Buffer.from("fake-image-bytes"), mime_type: "image/png", source_media_id: media_url };
  }
}

function deps(pool, client) {
  return {
    pool,
    provider: new mock_provider(),
    messaging_client: client,
    memory_store: new local_memory_store({ base_dir: ".storage/test-meta-memory" }),
  };
}

describe("inbound Meta: Instagram DM + Facebook Messenger", () => {
  let pool;
  beforeEach(async () => {
    pool = await create_test_pool();
    rm_sync(".storage/test-meta-memory", { recursive: true, force: true });
    rm_sync(".storage/test-meta-media", { recursive: true, force: true });
  });
  afterEach(async () => {
    await pool?.end();
    rm_sync(".storage/test-meta-memory", { recursive: true, force: true });
    rm_sync(".storage/test-meta-media", { recursive: true, force: true });
  });

  it("resuelve identidad de la cuenta IG y la página de FB sembradas", async () => {
    const ig = await resolve_instagram_identity_by_account_id(pool, IG_ACCOUNT);
    expect(ig.bot?.id).toBeTruthy();
    expect(ig.account?.id).toBeTruthy();
    expect(ig.organization?.id).toBeTruthy();
    expect(ig.channel_account.external_id).toBe(IG_ACCOUNT);

    const fb = await resolve_facebook_identity_by_page_id(pool, FB_PAGE);
    expect(fb.bot?.id).toBeTruthy();
    expect(fb.account?.id).toBeTruthy();
    expect(fb.channel_account.external_id).toBe(FB_PAGE);
  });

  it("lanza si la cuenta/página no tiene bot asignado", async () => {
    await expect(resolve_instagram_identity_by_account_id(pool, "no-such-ig")).rejects.toThrow();
    await expect(resolve_facebook_identity_by_page_id(pool, "no-such-page")).rejects.toThrow();
  });

  it("procesa un DM de Instagram: guarda mensaje/conversación/contacto y responde", async () => {
    const client = new fake_messaging_client();
    const results = await handle_instagram_webhook_payload(
      create_simulated_instagram_payload({
        recipient_id: IG_ACCOUNT,
        sender_id: "igsid-777",
        text: "vendimos 1500 hoy",
        message_id: "mid-ig-1",
        display_name: "cliente.ig",
      }),
      deps(pool, client),
    );
    expect(results).toHaveLength(1);

    const message = (await pool.query("SELECT * FROM messages WHERE direction = 'inbound' AND channel = 'instagram'")).rows[0];
    expect(message).toBeTruthy();
    expect(message.external_message_id).toBe("mid-ig-1");
    expect(message.text_body).toBe("vendimos 1500 hoy");

    const conversation = (await pool.query("SELECT * FROM conversations WHERE id = $1", [message.conversation_id])).rows[0];
    expect(conversation.channel).toBe("instagram");

    const contact = (await pool.query("SELECT * FROM contacts WHERE id = $1", [message.contact_id])).rows[0];
    expect(contact.channel).toBe("instagram");
    expect(contact.external_id).toBe("igsid-777");
    expect(contact.whatsapp_phone).toBeNull();
    expect(contact.display_name).toBe("cliente.ig");

    // Respondió por el mismo canal (Send API) al PSID/IGSID correcto.
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0].to).toBe("igsid-777");
    expect(client.sent[0].text).toBeTruthy();
    const outbound = (await pool.query("SELECT * FROM messages WHERE direction = 'outbound' AND channel = 'instagram'")).rows[0];
    expect(outbound.reply_to_message_id).toBe(message.id);
  });

  it("procesa un mensaje de Messenger: guarda y responde por messenger", async () => {
    const client = new fake_messaging_client();
    await handle_messenger_webhook_payload(
      create_simulated_messenger_payload({
        recipient_id: FB_PAGE,
        sender_id: "psid-555",
        text: "vendimos 900 hoy",
        message_id: "mid-fb-1",
      }),
      deps(pool, client),
    );
    const message = (await pool.query("SELECT * FROM messages WHERE direction = 'inbound' AND channel = 'messenger'")).rows[0];
    expect(message.text_body).toBe("vendimos 900 hoy");
    const contact = (await pool.query("SELECT * FROM contacts WHERE id = $1", [message.contact_id])).rows[0];
    expect(contact.channel).toBe("messenger");
    expect(contact.external_id).toBe("psid-555");
    expect(client.sent[0].to).toBe("psid-555");
  });

  it("descarga y guarda un adjunto entrante de Instagram (S3/local)", async () => {
    const client = new fake_messaging_client();
    await handle_instagram_webhook_payload(
      create_simulated_instagram_payload({
        recipient_id: IG_ACCOUNT,
        sender_id: "igsid-img",
        message_id: "mid-ig-img",
        attachments: [{ type: "image", payload: { url: "https://lookaside.fbsbx.com/demo.jpg" } }],
      }),
      deps(pool, client),
    );
    const att = (await pool.query("SELECT * FROM message_attachments WHERE channel = 'instagram'")).rows[0];
    expect(att).toBeTruthy();
    expect(att).toMatchObject({ channel: "instagram", provider: "local", mime_type: "image/png", status: "stored" });
    expect(att.source_media_id).toBe("https://lookaside.fbsbx.com/demo.jpg");
    rm_sync(att.local_path, { force: true });
  });

  it("deduplica el contacto por (cuenta, canal, external_id): mismo remitente IG = un contacto, una conversación", async () => {
    const client = new fake_messaging_client();
    await handle_instagram_webhook_payload(
      create_simulated_instagram_payload({ recipient_id: IG_ACCOUNT, sender_id: "igsid-dupe", text: "hola", message_id: "mid-d1" }),
      deps(pool, client),
    );
    await handle_instagram_webhook_payload(
      create_simulated_instagram_payload({ recipient_id: IG_ACCOUNT, sender_id: "igsid-dupe", text: "vendimos 200 hoy", message_id: "mid-d2" }),
      deps(pool, client),
    );
    const contacts = await pool.query("SELECT * FROM contacts WHERE channel = 'instagram' AND external_id = 'igsid-dupe'");
    const conversations = await pool.query("SELECT * FROM conversations WHERE channel = 'instagram'");
    const inbound = await pool.query("SELECT * FROM messages WHERE direction = 'inbound' AND channel = 'instagram'");
    expect(contacts.rowCount).toBe(1);
    expect(conversations.rowCount).toBe(1);
    expect(inbound.rowCount).toBe(2);
  });
});
