import { config } from "../../app/config.js";

export function extract_text_body(message) {
  return message.text?.body?.trim() ?? "";
}

export function extract_media_metadata(message) {
  if (message.image) {
    return {
      media_url: message.image.id ?? null,
      media_mime_type: message.image.mime_type ?? null,
    };
  }

  if (message.document) {
    return {
      media_url: message.document.id ?? null,
      media_mime_type: message.document.mime_type ?? null,
    };
  }

  return { media_url: null, media_mime_type: null };
}

export function create_simulated_whatsapp_payload(input) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "dev-entry",
        changes: [
          {
            field: "messages",
            value: {
              metadata: {
                phone_number_id: input.phone_number_id ?? config.whatsapp_phone_number_id,
                display_phone_number: "+525555999999",
              },
              contacts: [
                {
                  wa_id: input.from,
                  profile: { name: input.display_name ?? "Operador Demo" },
                },
              ],
              messages: [
                {
                  from: input.from,
                  id: input.message_id ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                  timestamp: Math.floor(Date.now() / 1000).toString(),
                  type: "text",
                  text: { body: input.text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
