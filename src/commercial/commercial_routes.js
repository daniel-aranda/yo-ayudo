import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { action_execution_service } from "../actions/action_execution_service.js";
import { list_action_audit_logs } from "../actions/action_audit_repository.js";
import { get_action, list_actions } from "../actions/action_registry.js";
import { bot_from_package_service } from "./bot_from_package_service.js";
import { get_agent_package, list_agent_packages } from "./agent_package_catalog.js";
import { diagnostico_ai_service } from "./diagnostico_ai_service.js";
import { get_discovery_interview } from "./discovery_interview_catalog.js";

function internal_auth(request, response, next) {
  if (
    config.node_env === "production" &&
    config.inspector_internal_token &&
    request.get("x-internal-token") !== config.inspector_internal_token
  ) {
    response.status(403).json({ ok: false, error: "forbidden" });
    return;
  }

  next();
}

function route_value(value) {
  return Array.isArray(value) ? value[0] : value;
}

export function register_commercial_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;
  const diagnosticos = new diagnostico_ai_service({ pool: route_pool });
  const bot_service = new bot_from_package_service({ pool: route_pool });
  const actions = new action_execution_service({ pool: route_pool });

  router.get("/internal/agent-packages", internal_auth, (request, response) => {
    response.json({
      ok: true,
      packages: list_agent_packages({ include_disabled: request.query.include_disabled === "true" }),
    });
  });

  router.get("/internal/agent-packages/:paquete_id", internal_auth, (request, response) => {
    const paquete = get_agent_package(route_value(request.params.paquete_id));

    if (!paquete) {
      response.status(404).json({ ok: false, error: "package_not_found" });
      return;
    }

    response.json({ ok: true, package: paquete });
  });

  router.get("/internal/actions", internal_auth, (_request, response) => {
    response.json({ ok: true, actions: list_actions() });
  });

  router.get("/internal/actions/:action_id", internal_auth, (request, response) => {
    const action = get_action(route_value(request.params.action_id));

    if (!action) {
      response.status(404).json({ ok: false, error: "action_not_found" });
      return;
    }

    response.json({ ok: true, action });
  });

  router.post("/internal/action-executions", internal_auth, async (request, response, next) => {
    try {
      const result = await actions.execute_action(request.body ?? {});
      response.json({ ok: true, result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/action-audit-logs", internal_auth, async (request, response, next) => {
    try {
      const logs = await list_action_audit_logs(route_pool, {
        organization_id: request.query.organization_id,
        account_id: request.query.account_id,
        bot_id: request.query.bot_id,
        action_id: request.query.action_id,
        limit: request.query.limit ? Number(request.query.limit) : 100,
      });
      response.json({ ok: true, logs });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/discovery-interview", internal_auth, (_request, response) => {
    response.json({ ok: true, interview: get_discovery_interview() });
  });

  router.post("/internal/bots/from-package", internal_auth, async (request, response, next) => {
    try {
      const result = await bot_service.create_bot_from_package(request.body ?? {});
      response.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/internal/diagnosticos-ai", internal_auth, async (request, response, next) => {
    try {
      const diagnostico = await diagnosticos.crear(request.body ?? {});
      response.status(201).json({ ok: true, diagnostico });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/diagnosticos-ai", internal_auth, async (request, response, next) => {
    try {
      const rows = await diagnosticos.listar({
        organization_id: request.query.organization_id,
        account_id: request.query.account_id,
        vendedor_id: request.query.vendedor_id,
        status: request.query.status,
        limit: request.query.limit ? Number(request.query.limit) : 100,
      });
      response.json({ ok: true, diagnosticos: rows });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/diagnosticos-ai/:diagnostico_id", internal_auth, async (request, response, next) => {
    try {
      const diagnostico = await diagnosticos.obtener(route_value(request.params.diagnostico_id));

      if (!diagnostico) {
        response.status(404).json({ ok: false, error: "diagnostico_not_found" });
        return;
      }

      response.json({ ok: true, diagnostico });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/internal/diagnosticos-ai/:diagnostico_id", internal_auth, async (request, response, next) => {
    try {
      const diagnostico = await diagnosticos.actualizar(route_value(request.params.diagnostico_id), request.body ?? {});

      if (!diagnostico) {
        response.status(404).json({ ok: false, error: "diagnostico_not_found" });
        return;
      }

      response.json({ ok: true, diagnostico });
    } catch (error) {
      next(error);
    }
  });

  router.post("/internal/diagnosticos-ai/:diagnostico_id/status", internal_auth, async (request, response, next) => {
    try {
      const diagnostico = await diagnosticos.cambiar_status(route_value(request.params.diagnostico_id), request.body.status);

      if (!diagnostico) {
        response.status(404).json({ ok: false, error: "diagnostico_not_found" });
        return;
      }

      response.json({ ok: true, diagnostico });
    } catch (error) {
      next(error);
    }
  });

  router.post("/internal/diagnosticos-ai/:diagnostico_id/propuesta-preliminar", internal_auth, async (request, response, next) => {
    try {
      const diagnostico = await diagnosticos.generar_propuesta_preliminar(route_value(request.params.diagnostico_id));

      if (!diagnostico) {
        response.status(404).json({ ok: false, error: "diagnostico_not_found" });
        return;
      }

      response.json({ ok: true, diagnostico });
    } catch (error) {
      next(error);
    }
  });
}
