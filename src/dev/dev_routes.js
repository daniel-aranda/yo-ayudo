import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { seed_development_data } from "../db/seed.js";
import { create_simulated_whatsapp_payload } from "../channels/whatsapp/whatsapp_message_parser.js";
import { handle_whatsapp_webhook_payload } from "../engine/message_processor.js";

export function register_dev_routes(router) {
  if (config.node_env === "production") {
    return;
  }

  router.post("/dev/seed", async (_request, response, next) => {
    try {
      const result = await seed_development_data(pool);
      response.json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/dev/simulate-whatsapp-message", async (request, response, next) => {
    try {
      const payload = create_simulated_whatsapp_payload({
        from: request.body.from ?? "5215550000000",
        text: request.body.text ?? "",
        phone_number_id: request.body.phone_number_id,
        display_name: request.body.display_name,
      });
      const results = await handle_whatsapp_webhook_payload(payload, { pool });
      response.json({ ok: true, results });
    } catch (error) {
      next(error);
    }
  });
}
