import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { action_execution_service } from "../actions/action_execution_service.js";
import { list_action_audit_logs } from "../actions/action_audit_repository.js";
import { get_action, list_actions } from "../actions/action_registry.js";
import { bot_configuration_service } from "../bot_engine/bot_configuration_service.js";
import { bot_engine_test_service } from "../bot_engine/bot_engine_test_service.js";
import { get_bot_template, list_bot_templates } from "../bot_engine/bot_template_repository.js";
import { list_bot_guardrail_events } from "../bot_engine/bot_guardrail_event_repository.js";
import { prompt_compiler } from "../bot_engine/prompt_compiler.js";
import { get_discovery_interview_from_db } from "../bot_engine/discovery_question_repository.js";
import { diagnostico_ai_service } from "./diagnostico_ai_service.js";

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

function handle_bot_test_error(error, response) {
  if (error.message?.startsWith("Bot no encontrado")) {
    response.status(404).json({ ok: false, error: "bot_not_found", message: error.message });
    return true;
  }

  if (error.message?.includes("modo_test=true")) {
    response.status(400).json({ ok: false, error: "modo_test_required", message: error.message });
    return true;
  }

  if (error.code === "bot_test_real_ai_required" || error.code?.startsWith("openai_")) {
    response.status(error.status ?? 400).json({ ok: false, error: error.code, message: error.message });
    return true;
  }

  return false;
}

export function register_commercial_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;
  const diagnosticos = new diagnostico_ai_service({ pool: route_pool });
  const bot_service = new bot_configuration_service({ pool: route_pool });
  const actions = new action_execution_service({ pool: route_pool });
  const compiler = new prompt_compiler({ pool: route_pool });
  const bot_engine_tester = new bot_engine_test_service({ pool: route_pool });

  router.get("/internal/bot-templates", internal_auth, async (request, response, next) => {
    try {
      response.json({
        ok: true,
        templates: await list_bot_templates(route_pool, {
          include_disabled: request.query.include_disabled === "true",
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/bot-templates/:template_id", internal_auth, async (request, response, next) => {
    try {
      const template = await get_bot_template(route_pool, route_value(request.params.template_id));

      if (!template) {
        response.status(404).json({ ok: false, error: "template_not_found" });
        return;
      }

      response.json({ ok: true, template });
    } catch (error) {
      next(error);
    }
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
      const result = await actions.execute_action({ ...(request.body ?? {}), actor_type: request.body?.actor_type ?? "system" });
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

  router.get("/internal/guardrail-events", internal_auth, async (request, response, next) => {
    try {
      const events = await list_bot_guardrail_events(route_pool, {
        organization_id: request.query.organization_id,
        account_id: request.query.account_id,
        bot_id: request.query.bot_id,
        tipo: request.query.tipo,
        status: request.query.status,
        limit: request.query.limit ? Number(request.query.limit) : 100,
      });
      response.json({ ok: true, events });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/discovery-interview", internal_auth, async (_request, response, next) => {
    try {
      response.json({ ok: true, interview: await get_discovery_interview_from_db(route_pool) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/bots", internal_auth, async (request, response, next) => {
    try {
      const bots = await bot_service.list_bots({
        account_id: request.query.account_id,
        limit: request.query.limit ? Number(request.query.limit) : 100,
      });
      response.json({ ok: true, bots });
    } catch (error) {
      next(error);
    }
  });

  router.post("/internal/bots", internal_auth, async (request, response, next) => {
    try {
      const result = await bot_service.create_configurable_bot(request.body ?? {});
      response.status(201).json({ ok: true, ...result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/internal/bots/:bot_id", internal_auth, async (request, response, next) => {
    try {
      const bot = await bot_service.get_bot(route_value(request.params.bot_id));

      if (!bot) {
        response.status(404).json({ ok: false, error: "bot_not_found" });
        return;
      }

      response.json({ ok: true, bot });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/internal/bots/:bot_id", internal_auth, async (request, response, next) => {
    try {
      const bot = await bot_service.update_configurable_bot(route_value(request.params.bot_id), request.body ?? {});

      if (!bot) {
        response.status(404).json({ ok: false, error: "bot_not_found" });
        return;
      }

      response.json({ ok: true, bot });
    } catch (error) {
      next(error);
    }
  });

  router.post("/internal/bots/:bot_id/actions/:action_id", internal_auth, async (request, response, next) => {
    try {
      const bot = await bot_service.set_action_enabled(
        route_value(request.params.bot_id),
        route_value(request.params.action_id),
        request.body.enabled !== false,
      );

      if (!bot) {
        response.status(404).json({ ok: false, error: "bot_not_found" });
        return;
      }

      response.json({ ok: true, bot });
    } catch (error) {
      next(error);
    }
  });

  router.post("/internal/bots/:bot_id/compile-prompt", internal_auth, async (request, response, next) => {
    try {
      const bot = await bot_service.get_bot(route_value(request.params.bot_id));

      if (!bot) {
        response.status(404).json({ ok: false, error: "bot_not_found" });
        return;
      }

      const compiled = await compiler.record_compilation({
        bot,
        conversation_id: request.body.conversation_id,
        business_knowledge: request.body.business_knowledge ?? [],
        conversation_memory: request.body.conversation_memory ?? [],
      });
      response.json({ ok: true, compiled });
    } catch (error) {
      next(error);
    }
  });

  router.post("/internal/bots/:bot_id/test-message", internal_auth, async (request, response, next) => {
    try {
      const result = await bot_engine_tester.test_message({
        ...(request.body ?? {}),
        bot_id: route_value(request.params.bot_id),
        require_real_ai: config.node_env !== "test",
      });
      response.json({ ok: true, result });
    } catch (error) {
      if (handle_bot_test_error(error, response)) return;

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
