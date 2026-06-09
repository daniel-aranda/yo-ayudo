import { describe, expect, it } from "vitest";
import { meta_whatsapp_client } from "../../src/channels/whatsapp/whatsapp_client.js";

function json_response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
  };
}

describe("whatsapp client send_voice_note", () => {
  it("uploads the audio then sends an audio message when credentials are configured", async () => {
    const calls = [];
    const fetcher = async (url, options = {}) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/media")) {
        return json_response({ id: "media-123" });
      }
      return json_response({ messages: [{ id: "wamid.OUT-1" }] });
    };

    const client = new meta_whatsapp_client();
    const result = await client.send_voice_note(
      { to: "521555000111", buffer: Buffer.from([1, 2, 3]), mime_type: "audio/mpeg" },
      { access_token: "wa-token", phone_number_id: "PN-1", fetcher },
    );

    expect(result).toMatchObject({ sent: true, media_id: "media-123", external_message_id: "wamid.OUT-1" });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/PN-1/media");
    expect(calls[1].url).toContain("/PN-1/messages");
    const sent_body = JSON.parse(calls[1].options.body);
    expect(sent_body).toMatchObject({
      messaging_product: "whatsapp",
      to: "521555000111",
      type: "audio",
      audio: { id: "media-123" },
    });
  });

  it("skips sending when WhatsApp credentials are missing", async () => {
    const client = new meta_whatsapp_client();
    const result = await client.send_voice_note(
      { to: "521555000111", buffer: Buffer.from([1, 2, 3]) },
      { access_token: "", phone_number_id: "", fetcher: async () => json_response({}) },
    );

    expect(result).toMatchObject({ sent: false, reason: "missing_whatsapp_credentials" });
  });
});
