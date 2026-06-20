import { logger } from "../shared/logger.js";

// Cliente único para los canales Messenger Platform de Meta: Instagram DM y
// Facebook Messenger comparten la MISMA Send API de Graph (`/me/messages` con el
// access token de la página/cuenta). El token NO está en config (es por página):
// llega resuelto desde la identidad del canal. Gated en credenciales: sin token
// NO envía (registra el motivo), nunca finge ni lanza. `fetcher`/`base_url`
// inyectables para tests.
export class meta_messaging_client {
  constructor(options = {}) {
    this.channel = options.channel ?? "messenger";
    this.base_url = (options.base_url ?? "https://graph.facebook.com/v21.0").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  // input: { to, text, access_token }. `to` es el PSID (Messenger) / IGSID (IG).
  async send_text(input) {
    const access_token = input.access_token;
    if (!access_token) {
      logger.info({ channel: this.channel, to: input.to }, "meta send skipped: no page access token");
      return { sent: false, reason: "missing_meta_credentials", raw_response: { skipped: true } };
    }
    if (!input.to) {
      return { sent: false, reason: "missing_recipient", raw_response: {} };
    }

    try {
      const response = await this.fetcher(`${this.base_url}/me/messages?access_token=${encodeURIComponent(access_token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: input.to },
          messaging_type: "RESPONSE",
          message: { text: input.text },
        }),
      });
      const raw_response = await response.json().catch(() => ({}));
      if (!response.ok) {
        logger.error({ channel: this.channel, status: response.status, raw_response }, "meta send failed");
        return { sent: false, reason: "send_failed", raw_response };
      }
      return {
        sent: true,
        external_message_id: raw_response.message_id ?? null,
        raw_response,
      };
    } catch (cause) {
      logger.error({ channel: this.channel, err: cause }, "meta send error");
      return { sent: false, reason: "send_error", raw_response: { error: cause.message } };
    }
  }

  // Descarga un adjunto entrante de IG/Messenger: en estos canales el webhook ya
  // trae la URL del CDN (lookaside) — basta un GET, sin lookup de media id como en
  // WhatsApp. Gated/seguro: nunca lanza, devuelve {downloaded:false, reason}.
  async download_media(media_url, options = {}) {
    const fetcher = options.fetcher ?? this.fetcher;
    if (!media_url) {
      return { downloaded: false, reason: "missing_media_url" };
    }
    try {
      const response = await fetcher(media_url);
      if (!response.ok) {
        logger.error({ channel: this.channel, status: response.status }, "meta media download failed");
        return { downloaded: false, reason: "download_failed", status: response.status };
      }
      const array_buffer = await response.arrayBuffer();
      return {
        downloaded: true,
        buffer: Buffer.from(array_buffer),
        mime_type: response.headers?.get?.("content-type") ?? options.mime_type ?? null,
        size_bytes: array_buffer.byteLength,
        source_media_id: media_url,
        original_filename: options.original_filename ?? null,
      };
    } catch (cause) {
      logger.error({ channel: this.channel, err: cause }, "meta media download error");
      return { downloaded: false, reason: "download_error", error: cause.message };
    }
  }
}
