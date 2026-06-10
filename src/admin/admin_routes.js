import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { get_integrations_admin_view } from "./admin_integrations_service.js";
import { get_interactions_admin_view } from "./admin_interactions_service.js";
import { get_bots_admin_view } from "./admin_bots_service.js";
import { available_agent_interactions } from "../inspector/inspector_repository.js";
import { upsert_interaction_setting } from "../interactions/interaction_settings_repository.js";

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
      const tab = request.query.tab === "config" ? "config" : "catalogo";
      response.render("admin/interactions", { ...view, tab });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/bots", admin_auth, async (request, response, next) => {
    try {
      const since_hours = Number.parseInt(request.query.since_hours, 10);
      const view = await get_bots_admin_view(route_pool, {
        since_hours: Number.isFinite(since_hours) && since_hours > 0 ? since_hours : undefined,
      });
      response.render("admin/bots", view);
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/interactions/settings", admin_auth, async (request, response, next) => {
    try {
      const body = request.body ?? {};
      const type = String(body.type ?? "").trim();
      const interaction = available_agent_interactions.find((item) => item.type === type);
      if (!interaction) {
        response.status(404).send("Interacción desconocida");
        return;
      }
      // Build config only from this interaction's declared, non-empty fields.
      const config_json = {};
      for (const field of interaction.settings_schema ?? []) {
        const value = String(body[`config_${field.key}`] ?? "").trim();
        if (value) {
          config_json[field.key] = value;
        }
      }
      await upsert_interaction_setting(route_pool, {
        type,
        action_id: interaction.action_id ?? null,
        // Unchecked checkbox is absent in the body → disabled.
        enabled: body.enabled !== undefined,
        config_json,
      });
      response.redirect("/admin/interactions?tab=config");
    } catch (error) {
      next(error);
    }
  });
}
