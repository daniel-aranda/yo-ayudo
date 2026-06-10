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

  it("renders the global bots admin with per-bot counts", async () => {
    const bot = (await pool.query("SELECT id, name FROM bots LIMIT 1")).rows[0];
    // One blocked action execution => one error counted for this bot.
    await pool.query(
      "INSERT INTO action_audit_logs (bot_id, action_id, status) VALUES ($1, 'buscar_negocios', 'blocked')",
      [bot.id],
    );

    const app = create_admin_test_app(pool);
    const response = await request(app).get("/admin/bots").expect(200);

    expect(response.text).toContain("Bots / agentes");
    expect(response.text).toContain(bot.name);
    expect(response.text).toContain("Mensajes");
    expect(response.text).toContain("Errores");
    // Subnav cross-links to the bots admin.
    expect(response.text).toContain('href="/inspector/bots/');
  });
});
