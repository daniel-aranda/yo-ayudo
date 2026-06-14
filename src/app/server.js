import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { pool } from "../db/client.js";
import { logger } from "../shared/logger.js";
import { format_money } from "../shared/money.js";
import { format_date_es, format_datetime_es } from "../shared/dates.js";
import { is_entrypoint } from "../shared/entrypoint.js";
import { register_dashboard_routes } from "../dashboard/dashboard_routes.js";
import { register_commercial_routes } from "../commercial/commercial_routes.js";
import { register_dev_routes } from "../dev/dev_routes.js";
import { register_inspector_routes } from "../inspector/inspector_routes.js";
import { register_admin_routes } from "../admin/admin_routes.js";
import { register_review_routes } from "../review/review_routes.js";
import { register_whatsapp_routes } from "../channels/whatsapp/whatsapp_webhook_routes.js";
import { json_text, message_alignment, format_phone } from "../inspector/inspector_presenter.js";
import { navigation_context } from "./navigation_middleware.js";
import { create_auth_policy, create_current_user_middleware } from "../auth/auth_middleware.js";
import { register_auth_routes } from "../auth/auth_routes.js";

export function create_app() {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.date = format_date_es;
  app.locals.datetime = format_datetime_es;
  app.locals.json = json_text;
  app.locals.message_alignment = message_alignment;
  app.locals.phone = format_phone;

  app.use(
    express.json({
      limit: "2mb",
      verify: (request, _response, buffer) => {
        request.raw_body = buffer;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));
  app.use("/public", express.static(path.join(process.cwd(), "src", "web", "public")));

  // Top-nav state (active section + account scope) for every view.
  app.use(navigation_context);

  // Auth opcional (AUTH_ENABLED): resuelve current_user de la cookie y aplica
  // la política owner-ve-todo / usuario-solo-su-negocio. Apagado = no-op.
  app.use(create_current_user_middleware({ pool }));
  app.use(create_auth_policy());

  router.get("/health", (_request, response) => {
    response.json({ ok: true, service: "yoayudo", environment: config.node_env });
  });

  router.get("/", (_request, response) => {
    response.redirect("/dashboard");
  });

  register_auth_routes(router);
  register_whatsapp_routes(router);
  register_dashboard_routes(router);
  register_commercial_routes(router);
  register_inspector_routes(router);
  register_admin_routes(router);
  register_review_routes(router);
  register_dev_routes(router);

  app.use(router);

  app.use((error, request, response, _next) => {
    const normalized_error = error instanceof Error ? error : new Error("Unknown error");
    logger.error({ err: normalized_error }, "request failed");

    const status = Number.isInteger(error?.status) ? error.status : 500;
    const expose_detail = config.node_env !== "production";
    const json_error = expose_detail ? normalized_error.message : "internal_server_error";

    const prefers_json =
      request.get("x-requested-with") === "XMLHttpRequest" ||
      request.accepts(["html", "json"]) === "json";

    if (prefers_json) {
      response.status(status).json({ ok: false, error: json_error });
      return;
    }

    response.status(status).render(
      "error",
      { error_message: expose_detail ? normalized_error.message : null },
      (render_error, html) => {
        if (render_error) {
          response.type("text").send("Ocurrió un error inesperado. Intenta de nuevo.");
          return;
        }

        response.send(html);
      },
    );
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
