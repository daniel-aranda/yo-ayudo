import { config } from "../app/config.js";
import { pool } from "../db/client.js";
import { get_integrations_admin_view } from "./admin_integrations_service.js";
import { get_interactions_admin_view } from "./admin_interactions_service.js";
import { get_bots_admin_view } from "./admin_bots_service.js";
import { get_businesses_admin_view } from "./admin_businesses_service.js";
import { get_guardrails_admin_view } from "./admin_guardrails_service.js";
import { get_conversations_admin_view } from "./admin_conversations_service.js";
import { add_task_update, get_task_detail, get_tasks_admin_view, update_task_status } from "./admin_tasks_service.js";
import { available_agent_interactions } from "../inspector/inspector_repository.js";
import { upsert_interaction_setting } from "../interactions/interaction_settings_repository.js";
import {
  create_organization,
  is_valid_entity_status,
  set_account_status,
  set_organization_status,
  slugify,
} from "../organizations/organization_repository.js";
import { upsert_account } from "../accounts/account_repository.js";
import { custom_bot_service } from "../bots/custom_bot_service.js";
import { get_bot_by_id, update_bot_status } from "../bots/bot_repository.js";
import { create_user } from "../auth/user_repository.js";
import { hash_password, MIN_PASSWORD_LENGTH } from "../auth/password_service.js";

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
        q: request.query.q,
        type: request.query.type,
        include_archived: request.query.archived === "1",
      });
      response.render("admin/bots", view);
    } catch (error) {
      next(error);
    }
  });

  // Cambiar estado de un bot (activar / pausar a borrador / archivar).
  router.post("/admin/bots/:bot_id/status", admin_auth, async (request, response, next) => {
    try {
      const status = String(request.body?.status ?? "");

      if (!["draft", "active", "archived"].includes(status)) {
        response.status(400).send("Estado inválido");
        return;
      }

      const updated = await update_bot_status(route_pool, { bot_id: request.params.bot_id, status });

      if (!updated) {
        response.status(404).send("El bot no existe.");
        return;
      }

      response.redirect("/admin/bots");
    } catch (error) {
      next(error);
    }
  });

  // Clonar un bot (system o custom) como copia custom en draft dentro de SU
  // cuenta, y abrir el editor de la copia.
  router.post("/admin/bots/:bot_id/clone", admin_auth, async (request, response, next) => {
    try {
      const source = await get_bot_by_id(route_pool, request.params.bot_id);

      if (!source) {
        response.status(404).send("El bot no existe.");
        return;
      }

      const bot_creator = new custom_bot_service({ pool: route_pool });
      const clone = await bot_creator.clone_bot({
        account_id: source.account_id,
        source_bot: source,
        name: `${source.name} (copia)`,
      });

      response.redirect(`/inspector/bots/${clone.id}`);
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/conversations", admin_auth, async (request, response, next) => {
    try {
      response.render(
        "admin/conversations",
        await get_conversations_admin_view(route_pool, {
          account_id: request.query.account_id,
          bot_id: request.query.bot_id,
          status: request.query.status,
          channel: request.query.channel,
          q: request.query.q,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/guardrails", admin_auth, async (request, response, next) => {
    try {
      response.render(
        "admin/guardrails",
        await get_guardrails_admin_view(route_pool, {
          account_id: request.query.account_id,
          bot_id: request.query.bot_id,
          tipo: request.query.tipo,
          action_id: request.query.action_id,
          status: request.query.status,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  // Convertir un guardrail event (capability gap) en tarea interna de backlog.
  router.post("/admin/guardrails/:event_id/task", admin_auth, async (request, response, next) => {
    try {
      const event = (
        await route_pool.query("SELECT * FROM bot_guardrail_events WHERE event_id = $1 LIMIT 1", [request.params.event_id])
      ).rows[0];

      if (!event) {
        response.status(404).send("Guardrail event no encontrado");
        return;
      }

      const titulo = `Capability gap: ${event.action_id || event.tipo}`;
      await route_pool.query(
        `
          INSERT INTO internal_tasks (
            organization_id, account_id, bot_id, conversation_id, titulo, descripcion, status, metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'pendiente', $7::jsonb)
        `,
        [
          event.organization_id ?? null,
          event.account_id ?? null,
          event.bot_id ?? null,
          event.conversation_id ?? null,
          titulo,
          event.descripcion,
          JSON.stringify({ source: "guardrail_event", guardrail_event_id: event.event_id, tipo: event.tipo, action_id: event.action_id }),
        ],
      );
      // El evento queda marcado para no convertirlo dos veces.
      await route_pool.query(
        "UPDATE bot_guardrail_events SET status = 'en_tarea', updated_at = now() WHERE event_id = $1",
        [event.event_id],
      );

      response.redirect("/admin/guardrails");
    } catch (error) {
      next(error);
    }
  });

  // Bandeja de tareas internas (lo que un humano tiene que hacer): las crea el
  // bot con `crear_tarea` o la conversión de un guardrail. Aquí se ven y resuelven.
  router.get("/admin/tasks", admin_auth, async (request, response, next) => {
    try {
      response.render(
        "admin/tasks",
        await get_tasks_admin_view(route_pool, {
          account_id: request.query.account_id,
          bot_id: request.query.bot_id,
          status: request.query.status,
          q: request.query.q,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  // Detalle de una tarea: estado + historial (quién atendió y qué pasó). Se abre
  // como página o dentro de un popup (iframe) desde la bandeja y la conversación.
  router.get("/admin/tasks/:task_id", admin_auth, async (request, response, next) => {
    try {
      const detail = await get_task_detail(route_pool, request.params.task_id);
      if (!detail) {
        response.status(404).send("Tarea no encontrada");
        return;
      }
      response.render("admin/task_detail", { ...detail, base_path: "/admin/tasks" });
    } catch (error) {
      next(error);
    }
  });

  // Follow-up de una tarea: avanzar su estado (pendiente → en progreso → hecha).
  router.post("/admin/tasks/:task_id/status", admin_auth, async (request, response, next) => {
    try {
      const result = await update_task_status(route_pool, {
        task_id: request.params.task_id,
        status: String(request.body?.status ?? "").trim(),
        actor: response.locals?.current_user?.name ?? null,
      });

      if (result.error) {
        response.status(result.error === "task_not_found" ? 404 : 400).send(result.message);
        return;
      }

      response.redirect(request.body?.return_to || "/admin/tasks");
    } catch (error) {
      next(error);
    }
  });

  // Agregar una actualización (quién atendió + qué pasó), opcional cambio de estado.
  router.post("/admin/tasks/:task_id/update", admin_auth, async (request, response, next) => {
    try {
      const result = await add_task_update(route_pool, {
        task_id: request.params.task_id,
        actor: request.body?.actor ?? response.locals?.current_user?.name ?? null,
        note: request.body?.note,
        status: String(request.body?.status ?? "").trim(),
      });

      if (result.error) {
        response.status(result.error === "task_not_found" ? 404 : 400).send(result.message);
        return;
      }

      response.redirect(`/admin/tasks/${request.params.task_id}`);
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/businesses", admin_auth, async (request, response, next) => {
    try {
      response.render(
        "admin/businesses",
        await get_businesses_admin_view(route_pool, {
          q: request.query.q,
          page: request.query.page,
          per_page: request.query.per_page,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/businesses", admin_auth, async (request, response, next) => {
    try {
      const name = String(request.body?.name ?? "").trim();
      if (!name) {
        response.status(400).send("Falta el nombre del negocio");
        return;
      }
      await create_organization(route_pool, { name });
      response.redirect("/admin/businesses");
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/businesses/:organization_id/status", admin_auth, async (request, response, next) => {
    try {
      const status = String(request.body?.status ?? "");
      if (!is_valid_entity_status(status)) {
        response.status(400).send("Estado inválido");
        return;
      }
      await set_organization_status(route_pool, request.params.organization_id, status);
      response.redirect("/admin/businesses");
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/accounts", admin_auth, async (request, response, next) => {
    try {
      const organization_id = String(request.body?.organization_id ?? "").trim();
      const name = String(request.body?.name ?? "").trim();
      if (!organization_id || !name) {
        response.status(400).send("Falta el negocio o el nombre de la cuenta");
        return;
      }
      await upsert_account(route_pool, { organization_id, name, slug: slugify(name) });
      response.redirect("/admin/businesses");
    } catch (error) {
      next(error);
    }
  });

  // Usuarios de negocio: loguean (AUTH_ENABLED) y solo ven su dashboard.
  router.post("/admin/users", admin_auth, async (request, response, next) => {
    try {
      const organization_id = String(request.body?.organization_id ?? "").trim();
      const name = String(request.body?.name ?? "").trim();
      const email = String(request.body?.email ?? "").trim();
      const password = String(request.body?.password ?? "");

      if (!organization_id || !name || !email || !password) {
        response.status(400).send("Faltan datos del usuario (negocio, nombre, email y contraseña).");
        return;
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        response.status(400).send(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
        return;
      }

      await create_user(route_pool, {
        organization_id,
        name,
        email,
        role: "member",
        password_hash: hash_password(password),
      });

      response.redirect("/admin/businesses");
    } catch (error) {
      if (error.code === "user_email_taken" || error.code === "user_missing_fields") {
        response.status(400).send(error.message);
        return;
      }
      next(error);
    }
  });

  router.post("/admin/accounts/:account_id/status", admin_auth, async (request, response, next) => {
    try {
      const status = String(request.body?.status ?? "");
      if (!is_valid_entity_status(status)) {
        response.status(400).send("Estado inválido");
        return;
      }
      await set_account_status(route_pool, request.params.account_id, status);
      response.redirect("/admin/businesses");
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
