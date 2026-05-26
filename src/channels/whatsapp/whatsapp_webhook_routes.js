import { config } from "../../app/config.js";
import { pool } from "../../db/client.js";
import { handle_whatsapp_webhook_payload } from "../../engine/message_processor.js";

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
    try {
      const results = await handle_whatsapp_webhook_payload(request.body, { pool });
      response.status(200).json({ ok: true, results });
    } catch (error) {
      next(error);
    }
  });
}
