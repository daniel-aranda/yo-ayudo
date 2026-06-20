import crypto from "node:crypto";
import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { logger } from "../shared/logger.js";
import {
  handle_instagram_webhook_payload,
  handle_messenger_webhook_payload,
} from "../engine/message_processor.js";

// Verifica la firma X-Hub-Signature-256 de Meta (HMAC-SHA256 del cuerpo crudo con
// el app secret). Instagram y Messenger usan la misma app de Meta, así que el
// secret cae al de WhatsApp si no hay uno específico. Sin secret (dev/test) se
// omite. Idéntico al de WhatsApp pero con `meta_app_secret`.
function verify_meta_signature(request) {
  if (!config.meta_app_secret) {
    return { ok: true, skipped: true };
  }

  const signature_header = request.get("x-hub-signature-256");
  if (!signature_header || !signature_header.startsWith("sha256=")) {
    return { ok: false, reason: "missing_signature" };
  }

  const raw_body = request.raw_body;
  if (!raw_body || !raw_body.length) {
    return { ok: false, reason: "missing_raw_body" };
  }

  const expected = `sha256=${crypto.createHmac("sha256", config.meta_app_secret).update(raw_body).digest("hex")}`;
  const provided_buffer = Buffer.from(signature_header);
  const expected_buffer = Buffer.from(expected);

  if (provided_buffer.length !== expected_buffer.length || !crypto.timingSafeEqual(provided_buffer, expected_buffer)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true };
}

// Registra el par GET (verificación de suscripción) + POST (recepción) para un
// canal de Meta basado en Messenger Platform. `handler` es la entrada del engine
// (handle_instagram/messenger_webhook_payload).
function register_meta_channel_route(router, { path, channel, handler }) {
  router.get(path, (request, response) => {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];

    if (mode === "subscribe" && token === config.meta_verify_token && typeof challenge === "string") {
      response.status(200).send(challenge);
      return;
    }

    response.status(403).send();
  });

  router.post(path, (request, response) => {
    const verification = verify_meta_signature(request);
    if (!verification.ok) {
      logger.warn({ channel, reason: verification.reason }, "rejected Meta webhook with invalid signature");
      response.status(401).json({ ok: false, error: "invalid_signature" });
      return;
    }

    // Ack inmediato: Meta espera un 200 rápido o reintenta (y acaba desactivando el
    // webhook). El trabajo pesado corre después del ack; la reentrega es segura por
    // la idempotencia sobre external_message_id.
    response.status(200).json({ ok: true });
    Promise.resolve()
      .then(() => handler(request.body, { pool }))
      .catch((error) => logger.error({ channel, err: error }, "async Meta webhook processing failed"));
  });
}

export function register_instagram_routes(router) {
  register_meta_channel_route(router, {
    path: "/webhooks/instagram",
    channel: "instagram",
    handler: handle_instagram_webhook_payload,
  });
}

export function register_messenger_routes(router) {
  register_meta_channel_route(router, {
    path: "/webhooks/messenger",
    channel: "messenger",
    handler: handle_messenger_webhook_payload,
  });
}
