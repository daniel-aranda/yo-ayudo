// Descriptores de canal: lo único específico por canal que el engine necesita.
// El núcleo del inbound (contacto/conversación/mensaje, IA, acciones, adjuntos,
// respuesta) es idéntico; cada canal solo cambia CÓMO resuelve identidad, envía y
// descarga media. El cliente concreto se inyecta (tests) o lo crea el handler del
// webhook.
import { resolve_whatsapp_identity_by_phone_number_id } from "./whatsapp/whatsapp_identity_resolver.js";
import { resolve_instagram_identity_by_account_id, resolve_facebook_identity_by_page_id } from "./meta_identity.js";

export const whatsapp_channel = {
  name: "whatsapp",
  integration_key: "whatsapp",
  resolve_identity: (pool, ref) => resolve_whatsapp_identity_by_phone_number_id(pool, ref),
  // WhatsApp Cloud API: el body va como { to, body }; el token vive en config.
  send_text: (client, _identity, { to, text }) => client.send_text({ to, body: text }),
  // WhatsApp entrega un media id que requiere lookup (lo hace el propio cliente).
  download_media: (client, _identity, media_ref) => client.download_media(media_ref),
};

// Instagram DM y Messenger comparten cliente (Graph Send API) y forma de webhook;
// solo difieren en la tabla de identidad y el nombre de canal. El access token de
// la página/cuenta llega resuelto en la identidad.
export const instagram_channel = {
  name: "instagram",
  integration_key: "instagram",
  resolve_identity: (pool, ref) => resolve_instagram_identity_by_account_id(pool, ref),
  send_text: (client, identity, { to, text }) => client.send_text({ to, text, access_token: identity?.access_token }),
  // En IG/Messenger el webhook ya trae la URL del adjunto: descarga directa.
  download_media: (client, _identity, media_ref) => client.download_media(media_ref),
};

export const messenger_channel = {
  name: "messenger",
  integration_key: "messenger",
  resolve_identity: (pool, ref) => resolve_facebook_identity_by_page_id(pool, ref),
  send_text: (client, identity, { to, text }) => client.send_text({ to, text, access_token: identity?.access_token }),
  download_media: (client, _identity, media_ref) => client.download_media(media_ref),
};
