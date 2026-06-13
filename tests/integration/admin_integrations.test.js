import express from "express";
import path from "node:path";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { register_admin_routes } from "../../src/admin/admin_routes.js";
import {
  record_integration_event,
  get_integration_event_summary,
} from "../../src/integrations/integration_event_repository.js";
import { get_interaction_settings_map } from "../../src/interactions/interaction_settings_repository.js";
import { create_test_pool } from "../helpers/test_pool.js";

function http_response(status) {
  return { ok: status >= 200 && status < 300, status, async json() { return {}; }, async text() { return ""; } };
}

function create_admin_test_app(pool) {
  const app = express();
  const router = express.Router();
  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  // Inject a fetcher so the live checks never hit real provider APIs in tests.
  register_admin_routes(router, { pool, fetcher: async () => http_response(200), s3_probe: async () => {} });
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });
  return app;
}

describe("admin integrations dashboard", () => {
  let pool;

  before_each(async () => {
    pool = await create_test_pool();
  });

  after_each(async () => {
    await pool?.end();
  });

  it("records integration events and summarizes recent positive/negative counts", async () => {
    await record_integration_event(pool, { integration_key: "elevenlabs", operation: "tts", status: "success" });
    await record_integration_event(pool, { integration_key: "elevenlabs", operation: "tts", status: "failure", detail: "401" });
    await record_integration_event(pool, { integration_key: "whatsapp", operation: "send_message", status: "success" });
    await record_integration_event(pool, { integration_key: "google_places", operation: "search", status: "not_configured" });

    const summary = await get_integration_event_summary(pool, { since_hours: 24 });

    expect(summary.get("elevenlabs")).toMatchObject({ success_count: 1, failure_count: 1 });
    expect(summary.get("whatsapp")).toMatchObject({ success_count: 1, failure_count: 0 });
    expect(summary.get("google_places")).toMatchObject({ not_configured_count: 1 });
  });

  it("renders the integrations dashboard with live status + recent counts", async () => {
    await record_integration_event(pool, { integration_key: "elevenlabs", operation: "tts", status: "failure", detail: "401" });

    const app = create_admin_test_app(pool);
    const response = await request(app).get("/admin/integrations").expect(200);

    expect(response.text).toContain("Integraciones");
    expect(response.text).toContain("PostgreSQL");
    expect(response.text).toContain("WhatsApp Cloud API");
    expect(response.text).toContain("ElevenLabs");
    expect(response.text).toContain("Estado de integraciones");
  });

  it("redirects /admin to the integrations dashboard", async () => {
    const app = create_admin_test_app(pool);
    await request(app).get("/admin").expect(302).expect("Location", "/admin/integrations");
  });

  it("renders the interactions admin with catalog, external API usage and recent logs", async () => {
    await pool.query(
      "INSERT INTO action_audit_logs (action_id, status) VALUES ('buscar_negocios', 'executed'), ('buscar_negocios', 'failed')",
    );
    await record_integration_event(pool, { integration_key: "google_places", operation: "search", status: "success", latency_ms: 42 });
    await pool.query(
      "INSERT INTO ai_calls (provider, model, function_name, input_json, status, latency_ms) VALUES ('openai', 'gpt-5.5', 'classify_intent', '{}'::jsonb, 'completed', 120)",
    );

    const app = create_admin_test_app(pool);
    const response = await request(app).get("/admin/interactions").expect(200);

    // Catalog of interactions is always listed.
    expect(response.text).toContain("Catálogo de interacciones");
    expect(response.text).toContain("Buscar negocios");
    // External API calls (AI + providers) are registered and measured.
    expect(response.text).toContain("APIs externas");
    expect(response.text).toContain("AI · openai");
    // Recent activity feed + tab navigator are wired.
    expect(response.text).toContain("Logs recientes");
    expect(response.text).toContain("interactions-tabs");
  });

  it("saves and reads back interaction settings (enable/disable + provider config)", async () => {
    const app = create_admin_test_app(pool);

    // `enabled` checkbox omitted => disabled; config fields are namespaced config_<key>.
    await request(app)
      .post("/admin/interactions/settings")
      .type("form")
      .send({ type: "responder_voz", config_model_id: "eleven_turbo_v2", config_voice_id: "abc123" })
      .expect(302)
      .expect("Location", "/admin/interactions?tab=config");

    const settings = await get_interaction_settings_map(pool);
    const voice = settings.get("responder_voz");
    expect(voice.enabled).toBe(false);
    expect(voice.action_id).toBe("responder_con_voz");
    expect(voice.config_json).toMatchObject({ model_id: "eleven_turbo_v2", voice_id: "abc123" });

    const page = await request(app).get("/admin/interactions?tab=config").expect(200);
    expect(page.text).toContain("Configuración de interacciones");
    expect(page.text).toContain("eleven_turbo_v2");
    expect(page.text).toContain("Inactiva");
  });

  it("renders guardrail events with filters, capability-gap rollup, and converts an event into an internal task", async () => {
    const bot = (await pool.query("SELECT id, account_id, organization_id FROM bots LIMIT 1")).rows[0];
    await pool.query(
      `INSERT INTO bot_guardrail_events (organization_id, account_id, bot_id, tipo, action_id, descripcion, severidad, status)
       VALUES ($1, $2, $3, 'accion_no_disponible', 'enviar_email', 'El bot intentó enviar un email pero no hay handler.', 'alta', 'nuevo')`,
      [bot.organization_id, bot.account_id, bot.id],
    );
    await pool.query(
      `INSERT INTO bot_guardrail_events (organization_id, account_id, bot_id, tipo, action_id, descripcion, severidad, status)
       VALUES ($1, $2, $3, 'proveedor_no_configurado', 'enviar_email', 'Proveedor de email no configurado.', 'media', 'nuevo')`,
      [bot.organization_id, bot.account_id, bot.id],
    );

    const app = create_admin_test_app(pool);
    const page = await request(app).get("/admin/guardrails").expect(200);
    expect(page.text).toContain("Guardrails y capability gaps");
    expect(page.text).toContain("Capability gaps por acción");
    expect(page.text).toContain("enviar_email");
    expect(page.text).toContain("accion_no_disponible");

    // Filtro por acción: solo eventos de esa acción.
    const filtered = await request(app).get("/admin/guardrails?action_id=enviar_email").expect(200);
    expect(filtered.text).toContain("enviar_email");
    // Filtro por tipo inexistente: estado vacío.
    const empty = await request(app).get("/admin/guardrails?tipo=permiso_insuficiente").expect(200);
    expect(empty.text).toContain("Sin guardrail events que coincidan");

    // Convertir un evento en tarea interna de backlog.
    const event = (
      await pool.query("SELECT event_id FROM bot_guardrail_events WHERE action_id = 'enviar_email' LIMIT 1")
    ).rows[0];
    await request(app)
      .post(`/admin/guardrails/${event.event_id}/task`)
      .expect(302)
      .expect("Location", "/admin/guardrails");

    const task = await pool.query(
      "SELECT * FROM internal_tasks WHERE (metadata_json->>'guardrail_event_id') = $1 LIMIT 1",
      [event.event_id],
    );
    expect(task.rows[0]).toBeTruthy();
    expect(task.rows[0].titulo).toContain("enviar_email");
    const updated = await pool.query("SELECT status FROM bot_guardrail_events WHERE event_id = $1", [event.event_id]);
    expect(updated.rows[0].status).toBe("en_tarea");

    // Evento inexistente → 404.
    await request(app).post("/admin/guardrails/00000000-0000-0000-0000-000000000099/task").expect(404);
  });

  it("renders the bots admin defaulting to live system bots, with search and type/archived filters", async () => {
    const system_bot = (
      await pool.query("SELECT id, name FROM bots WHERE bot_type = 'system' AND status = 'active' LIMIT 1")
    ).rows[0];
    const custom_bot = (
      await pool.query("SELECT id, name FROM bots WHERE bot_type = 'custom' AND status = 'active' LIMIT 1")
    ).rows[0];
    // One blocked action execution => one error counted for this bot.
    await pool.query(
      "INSERT INTO action_audit_logs (bot_id, action_id, status) VALUES ($1, 'buscar_negocios', 'blocked')",
      [system_bot.id],
    );

    const app = create_admin_test_app(pool);

    // Default: solo bots de sistema vivos, con label bonito y sin columna Mover.
    const response = await request(app).get("/admin/bots").expect(200);
    expect(response.text).toContain("Bots / agentes");
    expect(response.text).toContain(system_bot.name);
    expect(response.text).not.toContain(custom_bot.name);
    expect(response.text).toContain("Sistema");
    expect(response.text).not.toContain("Cuenta destino");
    expect(response.text).toContain("Mensajes");
    expect(response.text).toContain("Errores");
    expect(response.text).toContain('href="/inspector/bots/');
    // Acciones por icono (activar/pausar/archivar/clonar).
    expect(response.text).toContain(`/admin/bots/${system_bot.id}/status`);
    expect(response.text).toContain(`/admin/bots/${system_bot.id}/clone`);

    // Tipo: custom y todos.
    const custom_page = await request(app).get("/admin/bots?type=custom").expect(200);
    expect(custom_page.text).toContain(custom_bot.name);
    expect(custom_page.text).not.toContain(system_bot.name);
    expect(custom_page.text).toContain("Personalizado");
    const all_page = await request(app).get("/admin/bots?type=all").expect(200);
    expect(all_page.text).toContain(custom_bot.name);
    expect(all_page.text).toContain(system_bot.name);

    // Búsqueda por texto.
    const search_page = await request(app).get(`/admin/bots?type=all&q=${encodeURIComponent("prospectos")}`).expect(200);
    expect(search_page.text).toContain("Agente de Prospectos");
    expect(search_page.text).not.toContain(system_bot.name);

    // Archivados: ocultos por default, visibles con el toggle.
    await request(app)
      .post(`/admin/bots/${system_bot.id}/status`)
      .type("form")
      .send({ status: "archived" })
      .expect(302)
      .expect("Location", "/admin/bots");
    const without_archived = await request(app).get("/admin/bots").expect(200);
    expect(without_archived.text).not.toContain(system_bot.name);
    const with_archived = await request(app).get("/admin/bots?archived=1").expect(200);
    expect(with_archived.text).toContain(system_bot.name);

    // Estado inválido → 400.
    await request(app).post(`/admin/bots/${system_bot.id}/status`).type("form").send({ status: "bogus" }).expect(400);
  });

  it("clones a bot from admin as a draft custom copy in its own account", async () => {
    const app = create_admin_test_app(pool);
    const source = (
      await pool.query("SELECT * FROM bots WHERE bot_type = 'system' AND status = 'active' LIMIT 1")
    ).rows[0];

    const cloned = await request(app).post(`/admin/bots/${source.id}/clone`).expect(302);
    const clone = (
      await pool.query("SELECT * FROM bots WHERE account_id = $1 AND name = $2 LIMIT 1", [
        source.account_id,
        `${source.name} (copia)`,
      ])
    ).rows[0];
    expect(clone).toBeTruthy();
    expect(clone.bot_type).toBe("custom");
    expect(clone.status).toBe("draft");
    expect(cloned.headers.location).toBe(`/inspector/bots/${clone.id}`);

    await request(app).post("/admin/bots/00000000-0000-0000-0000-000000000003/clone").expect(404);
  });

  it("admin can create, list, pause and archive businesses and accounts", async () => {
    const app = create_admin_test_app(pool);

    await request(app)
      .post("/admin/businesses")
      .type("form")
      .send({ name: "Negocio Admin Test" })
      .expect(302)
      .expect("Location", "/admin/businesses");
    const org = (await pool.query("SELECT id, status FROM organizations WHERE slug = 'negocio-admin-test' LIMIT 1")).rows[0];
    expect(org).toBeTruthy();
    expect(org.status).toBe("active");

    await request(app)
      .post("/admin/accounts")
      .type("form")
      .send({ organization_id: org.id, name: "Cuenta Admin Test" })
      .expect(302);
    const account = (
      await pool.query("SELECT id FROM accounts WHERE organization_id = $1 AND slug = 'cuenta-admin-test' LIMIT 1", [org.id])
    ).rows[0];
    expect(account).toBeTruthy();

    await request(app).post(`/admin/accounts/${account.id}/status`).type("form").send({ status: "paused" }).expect(302);
    await request(app).post(`/admin/businesses/${org.id}/status`).type("form").send({ status: "archived" }).expect(302);
    expect((await pool.query("SELECT status FROM accounts WHERE id = $1", [account.id])).rows[0].status).toBe("paused");
    expect((await pool.query("SELECT status FROM organizations WHERE id = $1", [org.id])).rows[0].status).toBe("archived");

    // Invalid status is rejected.
    await request(app).post(`/admin/businesses/${org.id}/status`).type("form").send({ status: "bogus" }).expect(400);

    const page = await request(app).get("/admin/businesses").expect(200);
    expect(page.text).toContain("Negocio Admin Test");
    expect(page.text).toContain("Cuenta Admin Test");
    expect(page.text).toContain("Crear negocio");
    // Cada entidad enlaza a su dashboard y el panel se puede colapsar.
    expect(page.text).toContain(`href="/dashboard/business/${org.id}"`);
    expect(page.text).toContain(`href="/dashboard/business/${org.id}/accounts/${account.id}"`);
    expect(page.text).toContain("data-business-toggle");
    expect(page.text).toContain("toggle_all_businesses");
    // Estado como segmented control (Activo/Pausado/Archivado) y altas vía popups.
    expect(page.text).toContain("status-toggle");
    expect(page.text).toContain("Archivado");
    expect(page.text).toContain("data-create-account");
    expect(page.text).toContain("data-create-bot");
    expect(page.text).toContain("data-create-user");
    expect(page.text).toContain("create_business_popup");
  });

  it("searches and paginates the businesses admin list", async () => {
    const app = create_admin_test_app(pool);

    await request(app).post("/admin/businesses").type("form").send({ name: "Taquería Norte" }).expect(302);
    await request(app).post("/admin/businesses").type("form").send({ name: "Taquería Sur" }).expect(302);
    await request(app).post("/admin/businesses").type("form").send({ name: "Ferretería Centro" }).expect(302);

    // Búsqueda por nombre/slug (case-insensitive); la que no coincide no sale.
    const search_page = await request(app).get("/admin/businesses?q=taquer").expect(200);
    expect(search_page.text).toContain("Taquería Norte");
    expect(search_page.text).toContain("Taquería Sur");
    expect(search_page.text).not.toContain("Ferretería Centro");

    // Paginación: per_page se clampa a mínimo 10; con más de 10 negocios hay
    // segunda página y una página fuera de rango cae a la última.
    for (let index = 1; index <= 10; index += 1) {
      await request(app)
        .post("/admin/businesses")
        .type("form")
        .send({ name: `Negocio Paginado ${String(index).padStart(2, "0")}` })
        .expect(302);
    }
    const paged = await request(app).get("/admin/businesses?per_page=10").expect(200);
    expect(paged.text).toContain("Página 1 de 2");
    expect(paged.text).toContain("Siguiente");
    const clamped = await request(app).get("/admin/businesses?per_page=10&page=999").expect(200);
    expect(clamped.text).toContain("Página 2 de 2");
    expect(clamped.text).toContain("Anterior");

    const no_match = await request(app).get("/admin/businesses?q=no-existe-xyz").expect(200);
    expect(no_match.text).toContain("Sin negocios que coincidan");
  });

  it("creates a draft custom bot from admin and redirects to its editor", async () => {
    const app = create_admin_test_app(pool);
    const account = (await pool.query("SELECT id FROM accounts LIMIT 1")).rows[0];

    const created = await request(app)
      .post("/admin/bots")
      .type("form")
      .send({ account_id: account.id, name: "Bot Admin Test" })
      .expect(302);

    const bot = (
      await pool.query("SELECT * FROM bots WHERE account_id = $1 AND slug = 'bot-admin-test' LIMIT 1", [account.id])
    ).rows[0];
    expect(bot).toBeTruthy();
    expect(bot.bot_type).toBe("custom");
    expect(bot.status).toBe("draft");
    expect(created.headers.location).toBe(`/inspector/bots/${bot.id}`);

    // Mismo nombre otra vez: el slug se desambigua, no se pisa el bot existente.
    await request(app).post("/admin/bots").type("form").send({ account_id: account.id, name: "Bot Admin Test" }).expect(302);
    const duplicated = await pool.query("SELECT slug FROM bots WHERE account_id = $1 AND slug LIKE 'bot-admin-test%'", [
      account.id,
    ]);
    expect(duplicated.rows.map((row) => row.slug).sort()).toEqual(["bot-admin-test", "bot-admin-test-2"]);

    // Sin cuenta o sin nombre → 400.
    await request(app).post("/admin/bots").type("form").send({ name: "Sin cuenta" }).expect(400);
    await request(app)
      .post("/admin/bots")
      .type("form")
      .send({ account_id: "00000000-0000-0000-0000-000000000009", name: "Cuenta fantasma" })
      .expect(400);
  });

  it("moves a clean bot to another account and blocks bots with channels or history", async () => {
    const app = create_admin_test_app(pool);

    await request(app).post("/admin/businesses").type("form").send({ name: "Negocio Destino" }).expect(302);
    const target_org = (await pool.query("SELECT id FROM organizations WHERE slug = 'negocio-destino' LIMIT 1")).rows[0];
    await request(app)
      .post("/admin/accounts")
      .type("form")
      .send({ organization_id: target_org.id, name: "Cuenta Destino" })
      .expect(302);
    const target_account = (
      await pool.query("SELECT id FROM accounts WHERE organization_id = $1 AND slug = 'cuenta-destino' LIMIT 1", [
        target_org.id,
      ])
    ).rows[0];

    // Bot limpio recién creado: se puede mover, y queda en el negocio destino.
    const source_account = (await pool.query("SELECT id FROM accounts WHERE slug = 'yoayudo-ventas' LIMIT 1")).rows[0];
    await request(app)
      .post("/admin/bots")
      .type("form")
      .send({ account_id: source_account.id, name: "Bot Movible" })
      .expect(302);
    const bot = (await pool.query("SELECT id FROM bots WHERE slug = 'bot-movible' LIMIT 1")).rows[0];

    await request(app)
      .post(`/admin/bots/${bot.id}/move`)
      .type("form")
      .send({ account_id: target_account.id })
      .expect(302)
      .expect("Location", "/admin/bots");
    const moved = (await pool.query("SELECT account_id, organization_id, bot_profile_id FROM bots WHERE id = $1", [bot.id]))
      .rows[0];
    expect(moved.account_id).toBe(target_account.id);
    expect(moved.organization_id).toBe(target_org.id);
    expect(moved.bot_profile_id).toBeNull();

    // El bot seedeado tiene un canal de WhatsApp activo asignado: bloqueado.
    // (El move ya no tiene UI en /admin/bots — quedó como endpoint utilitario.)
    const seeded_bot = (await pool.query("SELECT id FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")).rows[0];
    const blocked = await request(app)
      .post(`/admin/bots/${seeded_bot.id}/move`)
      .type("form")
      .send({ account_id: target_account.id })
      .expect(400);
    expect(blocked.text).toContain("canales");
  });
});
