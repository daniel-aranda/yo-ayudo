import { config } from "../app/config.js";
import multer from "multer";
import { pool } from "../db/client.js";
import {
  get_account_view,
  get_bot_activity_view,
  get_bot_conversations,
  get_bot_view,
  get_conversation_view,
  get_inspector_home,
  get_message_trace_view,
  get_organization_view,
  update_bot_builder_view,
} from "./inspector_repository.js";
import { bot_engine_test_service } from "../bot_engine/bot_engine_test_service.js";
import { present_conversation_overview, present_conversation_turns } from "./inspector_presenter.js";
import {
  create_knowledge_source,
  get_knowledge_source,
  list_knowledge_sources,
  update_knowledge_source,
} from "../knowledge/knowledge_center_repository.js";
import { upload_knowledge_document_to_s3 } from "../knowledge/knowledge_s3_uploader.js";
import { safe_record_integration_event } from "../integrations/integration_event_repository.js";

function inspector_auth(request, response, next) {
  if (!config.inspector_enabled) {
    response.status(404).send("Inspector disabled");
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

function route_value(value) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function wants_json_response(request) {
  return request.get("x-requested-with") === "XMLHttpRequest" || request.accepts(["html", "json"]) === "json";
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

function knowledge_center_url(account_id) {
  return account_id ? `/inspector/accounts/${account_id}/knowledge` : "/inspector/knowledge";
}

async function get_account_scope(route_pool, account_id) {
  if (!account_id) {
    return null;
  }

  const result = await route_pool.query(
    `
      SELECT id, organization_id
      FROM accounts
      WHERE id = $1
      LIMIT 1
    `,
    [account_id],
  );

  if (!result.rows[0]) {
    return null;
  }

  return {
    account_id: result.rows[0].id,
    organization_id: result.rows[0].organization_id,
  };
}

async function render_knowledge_center(response, route_pool, input = {}) {
  response.status(input.status ?? 200).render("inspector/knowledge", {
    knowledge_sources: await list_knowledge_sources(route_pool, {
      organization_id: input.organization_id,
      account_id: input.account_id,
      limit: 200,
    }),
    knowledge_base_url: knowledge_center_url(input.account_id),
    error_message: input.error_message,
  });
}

export function register_inspector_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;
  const bot_engine_tester = new bot_engine_test_service({ pool: route_pool });
  const knowledge_document_uploader = dependencies.knowledge_document_uploader ?? upload_knowledge_document_to_s3;
  const knowledge_upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.knowledge_upload_max_bytes },
  });

  router.get("/inspector", inspector_auth, async (request, response, next) => {
    try {
      const account_id = route_value(request.query.account) || null;
      response.render("inspector/index", await get_inspector_home(route_pool, { account_id }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/organizations", inspector_auth, async (request, response, next) => {
    try {
      const account_id = route_value(request.query.account) || null;
      response.render("inspector/index", await get_inspector_home(route_pool, { account_id }));
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/organizations/:organization_id", inspector_auth, async (request, response, next) => {
    try {
      response.render(
        "inspector/organization",
        await get_organization_view(route_pool, route_value(request.params.organization_id)),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/accounts/:account_id", inspector_auth, async (request, response, next) => {
    try {
      response.render("inspector/account", await get_account_view(route_pool, route_value(request.params.account_id)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/bots/:bot_id", inspector_auth, async (request, response, next) => {
    try {
      if (request.query.saved !== undefined) {
        response.redirect(`/inspector/bots/${route_value(request.params.bot_id)}`);
        return;
      }

      response.render("inspector/bot", {
        ...(await get_bot_view(route_pool, route_value(request.params.bot_id))),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/bots/:bot_id/activity", inspector_auth, async (request, response, next) => {
    try {
      const view = await get_bot_activity_view(route_pool, route_value(request.params.bot_id));
      if (!view) {
        response.status(404).send("Bot not found");
        return;
      }
      response.render("inspector/activity", view);
    } catch (error) {
      next(error);
    }
  });

  router.post("/inspector/bots/:bot_id", inspector_auth, async (request, response, next) => {
    try {
      const bot = await update_bot_builder_view(route_pool, route_value(request.params.bot_id), request.body ?? {});

      if (!bot) {
        if (wants_json_response(request)) {
          response.status(404).json({ ok: false, error: "bot_not_found", message: "Bot not found" });
          return;
        }

        response.status(404).send("Bot not found");
        return;
      }

      if (wants_json_response(request)) {
        response.json({ ok: true, bot: { id: bot.id, name: bot.name, updated_at: bot.updated_at } });
        return;
      }

      response.redirect(`/inspector/bots/${bot.id}`);
    } catch (error) {
      next(error);
    }
  });

  router.post("/inspector/bots/:bot_id/test-message", inspector_auth, async (request, response, next) => {
    try {
      const result = await bot_engine_tester.test_message({
        ...(request.body ?? {}),
        bot_id: route_value(request.params.bot_id),
        modo_test: true,
        require_real_ai: config.node_env !== "test",
      });

      response.json({ ok: true, result });
    } catch (error) {
      if (handle_bot_test_error(error, response)) return;

      next(error);
    }
  });

  async function create_knowledge_source_from_request(request, response, scope) {
    try {
      const source_type = route_value(request.body.source_type) || "text";
      let metadata_json = {
        url: route_value(request.body.url) || null,
        source_type,
      };
      let content = route_value(request.body.content);
      let summary_status = "ready";

      if (source_type === "document") {
        if (!request.file) {
          await render_knowledge_center(response, route_pool, {
            status: 400,
            ...scope,
            error_message: "Selecciona un archivo para crear knowledge de tipo documento.",
          });
          return;
        }

        const upload_result = await knowledge_document_uploader({
          organization_id: scope?.organization_id ?? null,
          account_id: scope?.account_id ?? null,
          file: request.file,
        });
        await safe_record_integration_event(route_pool, {
          integration_key: "s3",
          operation: "upload",
          status: "success",
          organization_id: scope?.organization_id ?? null,
          account_id: scope?.account_id ?? null,
        });

        metadata_json = {
          ...metadata_json,
          file: upload_result,
        };
        content = route_value(request.body.description) || request.file.originalname;
        summary_status = "pending_ingestion";
      }

      await create_knowledge_source(route_pool, {
        organization_id: scope?.organization_id ?? null,
        account_id: scope?.account_id ?? null,
        scope: route_value(request.body.scope) || "account",
        source_type,
        name: route_value(request.body.name),
        description: route_value(request.body.description),
        content,
        summary_status,
        metadata_json,
      });

      response.redirect(knowledge_center_url(scope?.account_id));
    } catch (error) {
      if (!error.code?.startsWith("knowledge_s3_")) {
        throw error;
      }

      await safe_record_integration_event(route_pool, {
        integration_key: "s3",
        operation: "upload",
        status: error.code === "knowledge_s3_not_configured" ? "not_configured" : "failure",
        detail: error.message,
      });
      await render_knowledge_center(response, route_pool, {
        status: 400,
        ...scope,
        error_message: error.message,
      });
    }
  }

  function update_knowledge_source_from_request(request, source) {
    const metadata_json = {
      ...(source.metadata_json ?? {}),
    };
    const url = route_value(request.body.url);

    if (source.source_type === "url" || url) {
      metadata_json.url = url || null;
    }

    return update_knowledge_source(route_pool, source.id, {
      name: route_value(request.body.name),
      description: route_value(request.body.description),
      summary: route_value(request.body.summary),
      status: route_value(request.body.status),
      summary_status: route_value(request.body.summary_status),
      metadata_json,
    });
  }

  router.get("/inspector/accounts/:account_id/knowledge", inspector_auth, async (request, response, next) => {
    try {
      const scope = await get_account_scope(route_pool, route_value(request.params.account_id));

      if (!scope) {
        response.status(404).send("Account not found");
        return;
      }

      await render_knowledge_center(response, route_pool, scope);
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/inspector/accounts/:account_id/knowledge",
    inspector_auth,
    knowledge_upload.single("document_file"),
    async (request, response, next) => {
      try {
        const scope = await get_account_scope(route_pool, route_value(request.params.account_id));

        if (!scope) {
          response.status(404).send("Account not found");
          return;
        }

        await create_knowledge_source_from_request(request, response, scope);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/inspector/accounts/:account_id/knowledge/:source_id", inspector_auth, async (request, response, next) => {
    try {
      const scope = await get_account_scope(route_pool, route_value(request.params.account_id));
      const source = scope ? await get_knowledge_source(route_pool, route_value(request.params.source_id)) : null;

      if (!source || source.account_id !== scope.account_id) {
        response.status(404).send("Knowledge source not found");
        return;
      }

      const base_url = knowledge_center_url(scope.account_id);

      response.render("inspector/knowledge_detail", {
        source,
        back_url: base_url,
        form_action: `${base_url}/${source.id}`,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/inspector/accounts/:account_id/knowledge/:source_id", inspector_auth, async (request, response, next) => {
    try {
      const scope = await get_account_scope(route_pool, route_value(request.params.account_id));
      const source = scope ? await get_knowledge_source(route_pool, route_value(request.params.source_id)) : null;

      if (!source || source.account_id !== scope.account_id) {
        response.status(404).send("Knowledge source not found");
        return;
      }

      const updated = await update_knowledge_source_from_request(request, source);

      response.redirect(`${knowledge_center_url(scope.account_id)}/${updated.id}`);
    } catch (error) {
      next(error);
    }
  });

  // Rutas legacy: la URL canonica lleva la cuenta en el path. Redirigen cuando hay cuenta.
  router.get("/inspector/knowledge", inspector_auth, async (request, response, next) => {
    try {
      const account_id = route_value(request.query.account_id);

      if (account_id) {
        response.redirect(knowledge_center_url(account_id));
        return;
      }

      await render_knowledge_center(response, route_pool, {
        organization_id: route_value(request.query.organization_id) || undefined,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/inspector/knowledge", inspector_auth, knowledge_upload.single("document_file"), async (request, response, next) => {
    try {
      const scope = await get_account_scope(route_pool, route_value(request.body.account_id));

      await create_knowledge_source_from_request(request, response, scope);
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/knowledge/:source_id", inspector_auth, async (request, response, next) => {
    try {
      const source = await get_knowledge_source(route_pool, route_value(request.params.source_id));

      if (!source) {
        response.status(404).send("Knowledge source not found");
        return;
      }

      if (source.account_id) {
        response.redirect(`${knowledge_center_url(source.account_id)}/${source.id}`);
        return;
      }

      response.render("inspector/knowledge_detail", {
        source,
        back_url: "/inspector/knowledge",
        form_action: `/inspector/knowledge/${source.id}`,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/inspector/knowledge/:source_id", inspector_auth, async (request, response, next) => {
    try {
      const source = await get_knowledge_source(route_pool, route_value(request.params.source_id));

      if (!source) {
        response.status(404).send("Knowledge source not found");
        return;
      }

      const updated = await update_knowledge_source_from_request(request, source);

      response.redirect(`${knowledge_center_url(updated.account_id)}/${updated.id}`);
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/bots/:bot_id/conversations", inspector_auth, async (request, response, next) => {
    try {
      response.render(
        "inspector/conversations",
        await get_bot_conversations(route_pool, {
          bot_id: route_value(request.params.bot_id),
          status: request.query.status,
          search: request.query.search,
          limit: 100,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/conversations/:conversation_id", inspector_auth, async (request, response, next) => {
    try {
      const view = await get_conversation_view(route_pool, route_value(request.params.conversation_id));
      const view_turns = present_conversation_turns(view.turns);
      response.render("inspector/conversation", {
        ...view,
        view_turns,
        overview: present_conversation_overview(view_turns),
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/messages/:message_id", inspector_auth, async (request, response, next) => {
    try {
      response.render(
        "inspector/message_trace",
        await get_message_trace_view(route_pool, route_value(request.params.message_id)),
      );
    } catch (error) {
      next(error);
    }
  });
}
