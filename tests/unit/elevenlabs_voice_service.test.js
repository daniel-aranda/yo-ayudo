import { describe, expect, it } from "vitest";
import { synthesize_voice_reply } from "../../src/voice/elevenlabs_voice_service.js";

function audio_response(bytes = [1, 2, 3, 4], status = 200) {
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

describe("elevenlabs voice service", () => {
  it("returns pending_provider when ELEVENLABS_API_KEY is not configured", async () => {
    const result = await synthesize_voice_reply(
      { texto: "Hola, gracias por tu mensaje." },
      { api_key: "" },
    );

    expect(result).toMatchObject({ status: "pending_provider", provider: "elevenlabs" });
  });

  it("fails when there is no text to synthesize", async () => {
    const result = await synthesize_voice_reply({ texto: "" }, { api_key: "el-key" });

    expect(result.status).toBe("failed");
  });

  it("calls ElevenLabs and returns audio metadata when configured", async () => {
    const requests = [];
    const fetcher = async (url, options = {}) => {
      requests.push({ url: String(url), options });
      return audio_response([10, 20, 30, 40, 50]);
    };

    const result = await synthesize_voice_reply(
      { texto: "Hola, te confirmo tu cita." },
      { api_key: "el-test-key", voice_id: "voice-123", model_id: "eleven_multilingual_v2", fetcher },
    );

    expect(result.status).toBe("executed");
    expect(result.provider).toBe("elevenlabs");
    expect(result.voice_id).toBe("voice-123");
    expect(result.content_type).toBe("audio/mpeg");
    expect(result.audio_bytes).toBe(5);
    expect(Buffer.isBuffer(result.audio)).toBe(true);
    expect(requests[0].url).toContain("/v1/text-to-speech/voice-123");
    expect(requests[0].options.headers["xi-api-key"]).toBe("el-test-key");
  });
});
