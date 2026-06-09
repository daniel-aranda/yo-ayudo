import { describe, expect, it } from "vitest";
import { execute_internal_action_handler } from "../../src/actions/internal_action_handlers.js";
import { get_action } from "../../src/actions/action_registry.js";

function audio_response(bytes = [1, 2, 3], status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async arrayBuffer() {
      return new Uint8Array(bytes).buffer;
    },
    async text() {
      return "";
    },
  };
}

const action = get_action("responder_con_voz");

describe("responder_con_voz handler", () => {
  it("generates the voice and sends it over WhatsApp when both providers are configured", async () => {
    const sent = [];
    const fake_whatsapp_client = {
      async send_voice_note(input) {
        sent.push(input);
        return { sent: true, media_id: "media-9", external_message_id: "wamid.OUT-9" };
      },
    };

    const result = await execute_internal_action_handler(null, action, {
      conversation_id: null,
      input_json: { texto: "Hola, te confirmo tu cita.", to: "521555000111" },
      voice_options: { api_key: "el-key", voice_id: "voice-1", fetcher: async () => audio_response([5, 5, 5, 5]) },
      whatsapp_client: fake_whatsapp_client,
    });

    expect(result.status).toBe("executed");
    expect(result.output).toMatchObject({ enviado: true, to: "521555000111", external_message_id: "wamid.OUT-9" });
    expect(sent[0]).toMatchObject({ to: "521555000111", mime_type: "audio/mpeg" });
    expect(Buffer.isBuffer(sent[0].buffer)).toBe(true);
  });

  it("returns pending_provider when ElevenLabs is not configured", async () => {
    const result = await execute_internal_action_handler(null, action, {
      input_json: { texto: "Hola", to: "521555000111" },
      voice_options: { api_key: "" },
    });

    expect(result.status).toBe("pending_provider");
  });

  it("fails cleanly when no recipient can be resolved", async () => {
    const result = await execute_internal_action_handler(null, action, {
      conversation_id: null,
      input_json: { texto: "Hola" },
      voice_options: { api_key: "el-key", voice_id: "voice-1", fetcher: async () => audio_response() },
      whatsapp_client: { async send_voice_note() { return { sent: true }; } },
    });

    expect(result.status).toBe("failed");
    expect(result.output.mensaje).toMatch(/destino/i);
  });
});
