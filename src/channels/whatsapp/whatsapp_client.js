import { config } from "../../app/config.js";
import { logger } from "../../shared/logger.js";

export class meta_whatsapp_client {
  async send_text(input) {
    if (!config.whatsapp_access_token || !config.whatsapp_phone_number_id) {
      logger.info({ to: input.to }, "whatsapp send skipped because credentials are not configured");
      return {
        sent: false,
        raw_response: { skipped: true, reason: "missing_whatsapp_credentials" },
      };
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${config.whatsapp_phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.whatsapp_access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.to,
          type: "text",
          text: { preview_url: false, body: input.body },
        }),
      },
    );
    const raw_response = await response.json();

    if (!response.ok) {
      logger.error({ status: response.status, raw_response }, "whatsapp send failed");
      return { sent: false, raw_response };
    }

    return {
      sent: true,
      external_message_id: raw_response.messages?.[0]?.id,
      raw_response,
    };
  }

  // Sends a voice note: uploads the audio to the WhatsApp Cloud API media
  // endpoint, then sends an `audio` message referencing the returned media id.
  // Gated on credentials (returns skipped, never throws). `options.fetcher`,
  // `access_token`, `phone_number_id` and `base_url` are injectable for tests.
  async send_voice_note(input, options = {}) {
    const access_token = options.access_token ?? config.whatsapp_access_token;
    const phone_number_id = options.phone_number_id ?? config.whatsapp_phone_number_id;
    const fetcher = options.fetcher ?? fetch;
    const base_url = (options.base_url ?? "https://graph.facebook.com/v21.0").replace(/\/$/, "");
    const mime_type = input.mime_type ?? "audio/mpeg";
    const filename = input.filename ?? "voice-note.mp3";

    if (!access_token || !phone_number_id) {
      logger.info({ to: input.to }, "whatsapp voice send skipped because credentials are not configured");
      return { sent: false, reason: "missing_whatsapp_credentials", raw_response: { skipped: true } };
    }

    if (!input.to) {
      return { sent: false, reason: "missing_recipient", raw_response: {} };
    }

    if (!input.buffer) {
      return { sent: false, reason: "missing_audio", raw_response: {} };
    }

    // 1) Upload the audio as media.
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime_type);
    form.append("file", new Blob([input.buffer], { type: mime_type }), filename);

    const upload_response = await fetcher(`${base_url}/${phone_number_id}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${access_token}` },
      body: form,
    });
    const upload_json = await upload_response.json().catch(() => ({}));

    if (!upload_response.ok || !upload_json.id) {
      logger.error({ status: upload_response.status, raw_response: upload_json }, "whatsapp media upload failed");
      return { sent: false, reason: "media_upload_failed", raw_response: upload_json };
    }

    const media_id = upload_json.id;

    // 2) Send the audio message referencing the uploaded media.
    const send_response = await fetcher(`${base_url}/${phone_number_id}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "audio",
        audio: { id: media_id },
      }),
    });
    const send_json = await send_response.json().catch(() => ({}));

    if (!send_response.ok) {
      logger.error({ status: send_response.status, raw_response: send_json }, "whatsapp voice send failed");
      return { sent: false, reason: "send_failed", media_id, raw_response: send_json };
    }

    return {
      sent: true,
      media_id,
      external_message_id: send_json.messages?.[0]?.id,
      raw_response: send_json,
    };
  }

  async send_template(input) {
    logger.info(input, "whatsapp template send placeholder");
    return {
      sent: false,
      raw_response: { skipped: true, reason: "template_placeholder" },
    };
  }
}
