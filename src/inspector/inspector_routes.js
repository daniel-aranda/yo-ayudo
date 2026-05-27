import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import {
  get_account_view,
  get_bot_conversations,
  get_bot_view,
  get_conversation_view,
  get_inspector_home,
  get_message_trace_view,
  get_organization_view,
} from "./inspector_repository.js";

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

export function register_inspector_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;

  router.get("/inspector", inspector_auth, async (_request, response, next) => {
    try {
      response.render("inspector/index", await get_inspector_home(route_pool));
    } catch (error) {
      next(error);
    }
  });

  router.get("/inspector/organizations", inspector_auth, async (_request, response, next) => {
    try {
      response.render("inspector/index", await get_inspector_home(route_pool));
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
      response.render("inspector/bot", await get_bot_view(route_pool, route_value(request.params.bot_id)));
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
      response.render(
        "inspector/conversation",
        await get_conversation_view(route_pool, route_value(request.params.conversation_id)),
      );
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
