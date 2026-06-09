import { config } from "../app/config.js";

function compact_string(value) {
  return String(value ?? "").trim();
}

// Synthesizes a spoken reply with ElevenLabs Text-to-Speech.
//
// Mirrors the prospecting service contract: returns a status the action layer
// maps to an audit log + guardrail. Real call happens only when
// ELEVENLABS_API_KEY is configured; otherwise we return `pending_provider`
// instead of faking audio. `options.fetcher` is injectable for tests.
export async function synthesize_voice_reply(input = {}, options = {}) {
  const text = compact_string(input.texto ?? input.text ?? input.reply ?? input.mensaje);
  const api_key = options.api_key ?? config.elevenlabs_api_key;
  const voice_id = compact_string(input.voice_id ?? options.voice_id ?? config.elevenlabs_voice_id);
  const model_id = compact_string(input.model_id ?? options.model_id ?? config.elevenlabs_model_id);
  const base_url = (options.base_url ?? config.elevenlabs_base_url ?? "https://api.elevenlabs.io").replace(/\/$/, "");

  if (!text) {
    return {
      status: "failed",
      message: "Falta el texto a convertir en voz.",
      provider: "elevenlabs",
      voice_id,
    };
  }

  if (!api_key) {
    return {
      status: "pending_provider",
      message: "Configura ELEVENLABS_API_KEY para responder con voz.",
      provider: "elevenlabs",
      voice_id,
    };
  }

  if (!voice_id) {
    return {
      status: "failed",
      message: "Falta voice_id de ElevenLabs (define ELEVENLABS_VOICE_ID o envíalo en la acción).",
      provider: "elevenlabs",
    };
  }

  const fetcher = options.fetcher ?? fetch;

  try {
    const response = await fetcher(`${base_url}/v1/text-to-speech/${encodeURIComponent(voice_id)}`, {
      method: "POST",
      headers: {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: model_id || undefined,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        status: "failed",
        message: `ElevenLabs respondió ${response.status}.`,
        provider: "elevenlabs",
        voice_id,
        detail: detail.slice(0, 300),
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      status: "executed",
      message: "Audio de voz generado con ElevenLabs.",
      provider: "elevenlabs",
      voice_id,
      model_id,
      content_type: "audio/mpeg",
      audio_bytes: buffer.length,
      characters: text.length,
      // The raw audio is returned for the outbound sender; the action layer keeps
      // only metadata in the audit log to avoid persisting large payloads.
      audio: buffer,
    };
  } catch (error) {
    return {
      status: "failed",
      message: `No se pudo generar la voz: ${error.message}`,
      provider: "elevenlabs",
      voice_id,
    };
  }
}
