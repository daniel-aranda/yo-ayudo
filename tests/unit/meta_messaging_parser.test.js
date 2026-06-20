import { describe, it, expect } from "vitest";
import {
  parse_meta_messaging_payload,
  create_simulated_instagram_payload,
  create_simulated_messenger_payload,
} from "../../src/channels/meta_messaging_parser.js";

describe("meta messaging parser (Instagram DM + Messenger)", () => {
  it("normaliza un DM de Instagram (object instagram)", () => {
    const payload = create_simulated_instagram_payload({
      recipient_id: "ig-account-1",
      sender_id: "igsid-123",
      text: "hola, ¿tienen disponible?",
      message_id: "mid-abc",
      display_name: "cliente.ig",
    });
    const events = parse_meta_messaging_payload(payload, "instagram");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      channel: "instagram",
      channel_ref: "ig-account-1",
      sender_id: "igsid-123",
      external_message_id: "mid-abc",
      text: "hola, ¿tienen disponible?",
      display_name: "cliente.ig",
      message_type: "text",
    });
  });

  it("normaliza un mensaje de Messenger (object page)", () => {
    const payload = create_simulated_messenger_payload({
      recipient_id: "page-1",
      sender_id: "psid-999",
      text: "buenas",
      message_id: "mid-xyz",
    });
    const events = parse_meta_messaging_payload(payload, "messenger");
    expect(events[0]).toMatchObject({ channel: "messenger", channel_ref: "page-1", sender_id: "psid-999", text: "buenas" });
  });

  it("extrae el adjunto (URL directa) y el tipo", () => {
    const payload = create_simulated_instagram_payload({
      recipient_id: "ig-account-1",
      sender_id: "igsid-123",
      message_id: "mid-img",
      attachments: [{ type: "image", payload: { url: "https://lookaside.fbsbx.com/x.jpg" } }],
    });
    const events = parse_meta_messaging_payload(payload, "instagram");
    expect(events[0].message_type).toBe("image");
    expect(events[0].media).toEqual({ media_url: "https://lookaside.fbsbx.com/x.jpg", media_mime_type: null });
  });

  it("ignora echoes propios, eventos sin mensaje y mensajes vacíos", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "page-1",
          messaging: [
            { sender: { id: "psid-1" }, recipient: { id: "page-1" }, message: { mid: "m1", text: "ok", is_echo: true } },
            { sender: { id: "psid-2" }, recipient: { id: "page-1" }, read: { watermark: 1 } },
            { sender: { id: "psid-3" }, recipient: { id: "page-1" }, message: { mid: "m3", text: "   " } },
            { sender: { id: "psid-4" }, recipient: { id: "page-1" }, message: { mid: "m4", text: "real" } },
          ],
        },
      ],
    };
    const events = parse_meta_messaging_payload(payload, "messenger");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sender_id: "psid-4", text: "real" });
  });
});
