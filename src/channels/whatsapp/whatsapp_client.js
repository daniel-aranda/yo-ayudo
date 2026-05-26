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

  async send_template(input) {
    logger.info(input, "whatsapp template send placeholder");
    return {
      sent: false,
      raw_response: { skipped: true, reason: "template_placeholder" },
    };
  }
}
