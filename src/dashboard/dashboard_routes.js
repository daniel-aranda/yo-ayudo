import { pool as default_pool } from "../db/client.js";
import { dashboard_auth } from "./auth_middleware.js";
import {
  get_account_dashboard_data,
  get_business_dashboard_data,
  get_dashboard_home,
} from "./dashboard_queries.js";
import { custom_bot_service, minimal_draft_definition } from "../bots/custom_bot_service.js";
import {
  add_task_update,
  get_task_detail,
  get_tasks_admin_view,
  update_task_assignee,
  update_task_status,
} from "../admin/admin_tasks_service.js";
import { get_bot_by_id } from "../bots/bot_repository.js";
import { get_account_crm_view, get_crm_client_detail, update_crm_client_stage } from "../crm/crm_repository.js";
import { upsert_whatsapp_phone_number } from "../channels/whatsapp/whatsapp_number_repository.js";
import { assign_bot_to_whatsapp_phone_number } from "../bots/bot_assignment_repository.js";

function require_param(value, name) {
  if (Array.isArray(value)) {
    if (value[0]) {
      return value[0];
    }
    throw new Error(`Missing route param: ${name}`);
  }

  if (!value) {
    throw new Error(`Missing route param: ${name}`);
  }

  return value;
}

export function register_dashboard_routes(router, dependencies = {}) {
  const pool = dependencies.pool ?? default_pool;

  // La cuenta basta para identificar todo: el negocio se deriva de ella. Las
  // URLs son /dashboard/accounts/:account_id (el business no viaja en la ruta).
  async function resolve_account(account_id) {
    const result = await pool.query(
      `
        SELECT
          accounts.id,
          accounts.name AS account_name,
          accounts.organization_id AS business_id,
          organizations.name AS business_name
        FROM accounts
        JOIN organizations ON organizations.id = accounts.organization_id
        WHERE accounts.id = $1
        LIMIT 1
      `,
      [account_id],
    );
    return result.rows[0] ?? null;
  }

  // Contexto común para el módulo de tareas de una cuenta (resuelve la cuenta y
  // trae los nombres para el breadcrumb). Devuelve null si la cuenta no existe.
  async function account_tasks_context(request) {
    const account_id = require_param(request.params.account_id, "account_id");
    const account = await resolve_account(account_id);
    if (!account) {
      return null;
    }
    return {
      business_id: account.business_id,
      account_id,
      business_name: account.business_name,
      account_name: account.account_name,
      base_path: `/dashboard/accounts/${account_id}/tasks`,
    };
  }

  router.get("/dashboard", dashboard_auth, async (_request, response, next) => {
    try {
      response.render("dashboard", await get_dashboard_home(pool));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/business/:business_id", dashboard_auth, async (request, response, next) => {
    try {
      const business_id = require_param(request.params.business_id, "business_id");
      // Always show the business and its accounts, so the hierarchy
      // Negocio → Cuenta is explicit (no auto-redirect into a single account).
      response.render("business", await get_business_dashboard_data(pool, business_id));
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/dashboard/accounts/:account_id",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const data = await get_account_dashboard_data(pool, {
          account_id: require_param(request.params.account_id, "account_id"),
        });
        if (!data.account) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        response.render("account", data);
      } catch (error) {
        next(error);
      }
    },
  );

  // Compatibilidad: rutas viejas /dashboard/business/:b/accounts/:a[/...] →
  // canónica account-only. Un solo handler cubre la cuenta y todas las subrutas.
  router.get(
    ["/dashboard/business/:business_id/accounts/:account_id", "/dashboard/business/:business_id/accounts/:account_id/*"],
    dashboard_auth,
    (request, response) => {
      const account_id = require_param(request.params.account_id, "account_id");
      const rest = request.params[0] ? `/${request.params[0]}` : "";
      response.redirect(301, `/dashboard/accounts/${account_id}${rest}`);
    },
  );

  // Módulo de tareas a nivel cuenta: los usuarios del negocio ven y dan
  // seguimiento a las tareas de SU cuenta (quién atendió y qué pasó). Reusa la
  // bandeja y el detalle del admin, scopeados por account_id.
  router.get(
    "/dashboard/accounts/:account_id/tasks",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const context = await account_tasks_context(request);
        if (!context) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        const view = await get_tasks_admin_view(pool, {
          account_id: context.account_id,
          bot_id: request.query.bot_id,
          status: request.query.status,
          q: request.query.q,
        });
        response.render("admin/tasks", { ...view, ...context, scoped: true });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/dashboard/accounts/:account_id/tasks/:task_id",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const context = await account_tasks_context(request);
        if (!context) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        const detail = await get_task_detail(pool, request.params.task_id, { account_id: context.account_id });
        if (!detail) {
          response.status(404).send("Tarea no encontrada");
          return;
        }
        response.render("admin/task_detail", { ...detail, base_path: context.base_path });
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/dashboard/accounts/:account_id/tasks/:task_id/status",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const context = await account_tasks_context(request);
        if (!context) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        const result = await update_task_status(pool, {
          task_id: request.params.task_id,
          status: String(request.body?.status ?? "").trim(),
          actor: response.locals?.current_user?.name ?? null,
          account_id: context.account_id,
        });
        if (result.error) {
          response.status(result.error === "task_not_found" ? 404 : 400).send(result.message);
          return;
        }
        response.redirect(request.body?.return_to || context.base_path);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/dashboard/accounts/:account_id/tasks/:task_id/assign",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const context = await account_tasks_context(request);
        if (!context) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        const result = await update_task_assignee(pool, {
          task_id: request.params.task_id,
          assigned_to: request.body?.assigned_to,
          account_id: context.account_id,
        });
        if (result.error) {
          response.status(result.error === "task_not_found" ? 404 : 400).send(result.message);
          return;
        }
        response.redirect(request.body?.return_to || context.base_path);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/dashboard/accounts/:account_id/tasks/:task_id/update",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const context = await account_tasks_context(request);
        if (!context) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        const result = await add_task_update(pool, {
          task_id: request.params.task_id,
          actor: request.body?.actor ?? response.locals?.current_user?.name ?? null,
          note: request.body?.note,
          status: String(request.body?.status ?? "").trim(),
          account_id: context.account_id,
        });
        if (result.error) {
          response.status(result.error === "task_not_found" ? 404 : 400).send(result.message);
          return;
        }
        response.redirect(`${context.base_path}/${request.params.task_id}`);
      } catch (error) {
        next(error);
      }
    },
  );

  // CRM a nivel cuenta: los prospectos/clientes del negocio, agrupados por etapa
  // (base del futuro kanban). El detalle reusa la vista de prospecto del inspector,
  // scopeado al dashboard para no sacar al usuario de su cuenta.
  router.get(
    "/dashboard/accounts/:account_id/crm",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const account_id = require_param(request.params.account_id, "account_id");
        const view = await get_account_crm_view(pool, account_id);
        if (!view.account) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        response.render("dashboard/crm", { ...view, account_id });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/dashboard/accounts/:account_id/crm/:client_id",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const account_id = require_param(request.params.account_id, "account_id");
        const client = await get_crm_client_detail(pool, request.params.client_id);
        if (!client || String(client.account_id) !== String(account_id)) {
          response.status(404).send("Prospecto no encontrado");
          return;
        }
        response.render("inspector/crm_client_detail", { client, back_href: `/dashboard/accounts/${account_id}/crm` });
      } catch (error) {
        next(error);
      }
    },
  );

  // Mover un prospecto de etapa (drop en el tablero o select del detalle).
  router.post(
    "/dashboard/accounts/:account_id/crm/:client_id/stage",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const account_id = require_param(request.params.account_id, "account_id");
        const result = await update_crm_client_stage(pool, {
          client_id: request.params.client_id,
          account_id,
          stage: request.body?.stage,
        });
        if (result.error) {
          response.status(result.error === "not_found" ? 404 : 400).send(result.message);
          return;
        }
        response.redirect(request.body?.return_to || `/dashboard/accounts/${account_id}/crm`);
      } catch (error) {
        next(error);
      }
    },
  );

  // Alta de bot desde el dashboard de la cuenta: custom desde cero (name) o
  // clonando un bot de sistema como base (source_bot_id). Queda en draft y
  // aparece en el panel de bots; se configura en el editor del inspector.
  router.post(
    "/dashboard/accounts/:account_id/bots",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const account_id = require_param(request.params.account_id, "account_id");

        if (!(await resolve_account(account_id))) {
          response.status(404).send("La cuenta no existe.");
          return;
        }

        const bot_creator = new custom_bot_service({ pool });
        const source_bot_id = String(request.body?.source_bot_id ?? "").trim();
        const name = String(request.body?.name ?? "").trim();

        if (source_bot_id) {
          const source_bot = await get_bot_by_id(pool, source_bot_id);

          if (!source_bot || source_bot.bot_type !== "system") {
            response.status(400).send("El bot de sistema seleccionado no existe.");
            return;
          }

          await bot_creator.clone_bot({ account_id, source_bot, name });
        } else {
          if (!name) {
            response.status(400).send("Falta el nombre del bot.");
            return;
          }

          await bot_creator.create_custom_bot({
            account_id,
            name,
            slug: await bot_creator.unique_slug_for(account_id, name),
            status: "draft",
            definition_json: minimal_draft_definition(name),
          });
        }

        response.redirect(`/dashboard/accounts/${account_id}#panel-bots`);
      } catch (error) {
        next(error);
      }
    },
  );

  // Alta de canal desde el dashboard de la cuenta. Hoy solo WhatsApp (número +
  // phone_number_id de Meta, con bot opcional para conectarlo de una vez);
  // Instagram llegará vía OAuth y el endpoint lo rechaza explícitamente.
  router.post(
    "/dashboard/accounts/:account_id/channels",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const account_id = require_param(request.params.account_id, "account_id");

        const account = await resolve_account(account_id);
        if (!account) {
          response.status(404).send("La cuenta no existe.");
          return;
        }
        // El negocio (organization_id del canal) se deriva de la cuenta.
        const business_id = account.business_id;

        const channel_type = String(request.body?.channel_type ?? "").trim();

        if (channel_type !== "whatsapp") {
          response.status(400).send("Canal no soportado todavía.");
          return;
        }

        const display_phone_number = String(request.body?.display_phone_number ?? "").trim();
        const phone_number_id = String(request.body?.phone_number_id ?? "").trim();

        if (!display_phone_number || !phone_number_id) {
          response.status(400).send("Faltan el número de WhatsApp o el ID del número en Meta.");
          return;
        }

        // El upsert es por phone_number_id: si ya existe en OTRA cuenta, dar de
        // alta aquí lo re-parentaría (robaría el canal). Se bloquea explícito.
        const existing = await pool.query("SELECT account_id FROM whatsapp_phone_numbers WHERE phone_number_id = $1 LIMIT 1", [
          phone_number_id,
        ]);

        if (existing.rows[0] && existing.rows[0].account_id !== account_id) {
          response.status(400).send("Ese ID de número ya está dado de alta en otra cuenta.");
          return;
        }

        const channel = await upsert_whatsapp_phone_number(pool, {
          organization_id: business_id,
          account_id,
          phone_number_id,
          display_phone_number,
          status: "active",
        });

        const bot_id = String(request.body?.bot_id ?? "").trim();

        if (bot_id) {
          const bot = await get_bot_by_id(pool, bot_id);

          if (!bot || bot.account_id !== account_id) {
            response.status(400).send("El bot seleccionado no pertenece a esta cuenta.");
            return;
          }

          await assign_bot_to_whatsapp_phone_number(pool, {
            organization_id: business_id,
            account_id,
            whatsapp_phone_number_id: channel.id,
            bot_id: bot.id,
            metadata_json: { source: "account_dashboard" },
          });
        }

        response.redirect(`/dashboard/accounts/${account_id}#panel-canales`);
      } catch (error) {
        next(error);
      }
    },
  );
}
