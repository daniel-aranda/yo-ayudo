import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { pool } from "../db/client.js";
import { logger } from "../shared/logger.js";
import { format_money } from "../shared/money.js";
import { is_entrypoint } from "../shared/entrypoint.js";
import { register_dashboard_routes } from "../dashboard/dashboard_routes.js";
import { register_dev_routes } from "../dev/dev_routes.js";
import { register_inspector_routes } from "../inspector/inspector_routes.js";
import { register_review_routes } from "../review/review_routes.js";
import { register_whatsapp_routes } from "../channels/whatsapp/whatsapp_webhook_routes.js";
import { json_text, message_alignment } from "../inspector/inspector_presenter.js";

export function create_app() {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.json = json_text;
  app.locals.message_alignment = message_alignment;

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use("/public", express.static(path.join(process.cwd(), "src", "web", "public")));

  router.get("/health", (_request, response) => {
    response.json({ ok: true, service: "yoayudo", environment: config.node_env });
  });

  register_whatsapp_routes(router);
  register_dashboard_routes(router);
  register_inspector_routes(router);
  register_review_routes(router);
  register_dev_routes(router);

  app.use(router);

  app.use((error, _request, response, _next) => {
    const normalized_error = error instanceof Error ? error : new Error("Unknown error");
    logger.error({ err: normalized_error }, "request failed");
    response.status(500).json({
      ok: false,
      error: config.node_env === "production" ? "internal_server_error" : normalized_error.message,
    });
  });

  return app;
}

if (is_entrypoint(import.meta.url)) {
  const app = create_app();
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, "server listening");
  });

  const shutdown = () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
