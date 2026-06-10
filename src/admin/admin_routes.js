import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { get_integrations_admin_view } from "./admin_integrations_service.js";
import { get_interactions_admin_view } from "./admin_interactions_service.js";

// Same internal gating as the inspector: 404 when disabled, token-protected in
// production. Open in local development.
function admin_auth(request, response, next) {
  if (!config.inspector_enabled) {
    response.status(404).send("Admin disabled");
    return;
  }

  if (
    config.node_env === "production" &&
    config.inspector_internal_token &&
    request.get("x-internal-token") !== config.inspector_internal_token
  ) {
    response.status(403).send("Forbidden");
    return;
  }

  next();
}

export function register_admin_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;

  router.get("/admin", admin_auth, (_request, response) => {
    response.redirect("/admin/integrations");
  });

  router.get("/admin/integrations", admin_auth, async (_request, response, next) => {
    try {
      const view = await get_integrations_admin_view(route_pool, {
        fetcher: dependencies.fetcher,
        s3_probe: dependencies.s3_probe,
      });
      response.render("admin/integrations", view);
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/interactions", admin_auth, async (request, response, next) => {
    try {
      const since_hours = Number.parseInt(request.query.since_hours, 10);
      const view = await get_interactions_admin_view(route_pool, {
        since_hours: Number.isFinite(since_hours) && since_hours > 0 ? since_hours : undefined,
      });
      response.render("admin/interactions", view);
    } catch (error) {
      next(error);
    }
  });
}
