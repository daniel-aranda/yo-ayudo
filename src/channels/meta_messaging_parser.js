// Parser del webhook "Messenger Platform" de Meta, compartido por Instagram DM y
// Facebook Messenger (tienen la MISMA forma: entry[].messaging[] con sender /
// recipient / message, a diferencia de WhatsApp Cloud API que usa
// entry[].changes[].value.messages[]). Devuelve eventos normalizados que el
// engine consume igual para cualquier canal.

const ATTACHMENT_MIME_BY_TYPE = {
  image: null, // el content-type real llega al descargar el binario
  audio: "audio/mpeg",
  video: "video/mp4",
  file: null,
};

function first_media_attachment(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  for (const attachment of attachments) {
    const url = attachment?.payload?.url;
    if (url) {
      return {
        media_url: url,
        media_mime_type: ATTACHMENT_MIME_BY_TYPE[attachment.type] ?? null,
        media_type: attachment.type ?? "file",
      };
    }
  }
  return null;
}

// payload + channel ("instagram" | "messenger") → eventos normalizados (ya
// filtrados: ignora echoes propios, reads, deliveries, postbacks sin mensaje).
export function parse_meta_messaging_payload(payload, channel) {
  const events = [];
  for (const entry of payload?.entry ?? []) {
    for (const messaging of entry.messaging ?? []) {
      const message = messaging.message;
      // Solo mensajes entrantes con contenido. Los echoes (message.is_echo) son
      // nuestras propias salidas reflejadas por Meta — nunca reprocesarlas.
      if (!message || message.is_echo) {
        continue;
      }
      const sender_id = messaging.sender?.id ?? null;
      if (!sender_id) {
        continue;
      }
      const media = first_media_attachment(message);
      const text = typeof message.text === "string" ? message.text.trim() : "";
      if (!text && !media) {
        continue;
      }
      events.push({
        channel,
        // recipient.id = la página de FB / cuenta IG (cae a entry.id). Es la clave
        // de ruteo hacia el bot asignado.
        channel_ref: messaging.recipient?.id ?? entry.id ?? null,
        sender_id,
        // Los webhooks de Meta normalmente NO traen el nombre del remitente (haría
        // falta un lookup de perfil); si viene `username`, se usa, si no, null.
        display_name: messaging.sender?.username ?? message.from?.name ?? null,
        external_message_id: message.mid ?? null,
        text,
        message_type: media ? media.media_type : "text",
        media: media ? { media_url: media.media_url, media_mime_type: media.media_mime_type } : null,
        timestamp: messaging.timestamp ?? null,
        raw: messaging,
      });
    }
  }
  return events;
}

function build_simulated_payload(object, input) {
  const sender = { id: input.sender_id ?? "meta-sender-1" };
  if (input.display_name) {
    sender.username = input.display_name;
  }
  const message = { mid: input.message_id ?? `mid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  if (input.text != null) {
    message.text = input.text;
  }
  if (input.attachments) {
    message.attachments = input.attachments;
  }
  return {
    object,
    entry: [
      {
        id: input.recipient_id ?? "meta-account-1",
        time: Math.floor(Date.now() / 1000),
        messaging: [
          {
            sender,
            recipient: { id: input.recipient_id ?? "meta-account-1" },
            timestamp: Math.floor(Date.now() / 1000) * 1000,
            message,
          },
        ],
      },
    ],
  };
}

export function create_simulated_instagram_payload(input) {
  return build_simulated_payload("instagram", input);
}

export function create_simulated_messenger_payload(input) {
  return build_simulated_payload("page", input);
}
