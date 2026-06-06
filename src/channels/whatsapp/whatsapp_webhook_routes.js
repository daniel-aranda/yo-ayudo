import crypto from "node:crypto";
import { config } from "../../app/config.js";
import { pool } from "../../db/client.js";
import { logger } from "../../shared/logger.js";
import { handle_whatsapp_webhook_payload } from "../../engine/message_processor.js";

// Verifies Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw request body
// using the app secret). Without this, anyone who knows the webhook URL could inject
// fake inbound messages — and for an operations bot that means fake sales/purchases.
// When no app secret is configured (local dev / tests), verification is skipped.
function verify_meta_signature(request) {
  if (!config.whatsapp_app_secret) {
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

  const expected = `sha256=${crypto.createHmac("sha256", config.whatsapp_app_secret).update(raw_body).digest("hex")}`;
  const provided_buffer = Buffer.from(signature_header);
  const expected_buffer = Buffer.from(expected);

  if (
    provided_buffer.length !== expected_buffer.length ||
    !crypto.timingSafeEqual(provided_buffer, expected_buffer)
  ) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true };
}

export function register_whatsapp_routes(router) {
  router.get("/webhooks/whatsapp", (request, response) => {
    const mode = request.query["hub.mode"];
    const token = request.query["hub.verify_token"];
    const challenge = request.query["hub.challenge"];

    if (mode === "subscribe" && token === config.whatsapp_verify_token && typeof challenge === "string") {
      response.status(200).send(challenge);
      return;
    }

    response.status(403).send();
  });

  router.post("/webhooks/whatsapp", async (request, response, next) => {
    const verification = verify_meta_signature(request);
    if (!verification.ok) {
      logger.warn({ reason: verification.reason }, "rejected WhatsApp webhook with invalid signature");
      response.status(401).json({ ok: false, error: "invalid_signature" });
      return;
    }

    try {
      const results = await handle_whatsapp_webhook_payload(request.body, { pool });
      response.status(200).json({ ok: true, results });
    } catch (error) {
      next(error);
    }
  });
}
