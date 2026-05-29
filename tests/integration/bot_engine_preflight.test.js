import express from "express";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { register_commercial_routes } from "../../src/commercial/commercial_routes.js";
import { create_test_pool } from "../helpers/test_pool.js";

function create_test_app(pool) {
  const app = express();
  const router = express.Router();

  app.use(express.json());
  register_commercial_routes(router, { pool });
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(500).json({ ok: false, error: error.message });
  });

  return app;
}

describe("bot engine founder preflight", () => {
  let pool;
  let app;

  before_each(async () => {
    pool = await create_test_pool();
    app = create_test_app(pool);
  });

  after_each(async () => {
    await pool?.end();
  });

  it("loads the internal YoAyudo configurable bot and executes safe internal actions in test mode", async () => {
    const account_result = await pool.query("SELECT * FROM accounts WHERE slug = 'demo-account' LIMIT 1");
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'operador_comercial_yoayudo' LIMIT 1");
    const account = account_result.rows[0];
    const bot = bot_result.rows[0];

    expect(account.name).toBe("YoAyudo Ventas");
    expect(bot.bot_type).toBe("custom");
    expect(bot.acciones_habilitadas_json).toEqual(
      expect.arrayContaining(["guardar_nota", "crear_tarea", "generar_resumen", "solicitar_aprobacion_humana"]),
    );

    const compile_response = await request(app)
      .post(`/internal/bots/${bot.id}/compile-prompt`)
      .send({})
      .expect(200);

    expect(compile_response.body.compiled.acciones_disponibles.map((action) => action.action_id)).toEqual(
      expect.arrayContaining(["guardar_nota", "crear_tarea", "generar_resumen"]),
    );

    const test_response = await request(app)
      .post(`/internal/bots/${bot.id}/test-message`)
      .send({
        organization_id: account.organization_id,
        account_id: account.id,
        modo_test: true,
        mensaje:
          "Registra este prospecto: Clínica Dental Sonrisa. Llegó por recomendación. Quiere responder WhatsApp fuera de horario y confirmar citas. Crea una tarea para llamarle mañana y prepara un resumen del posible diagnóstico. También intenta programar una llamada automática.",
      })
      .expect(200);

    expect(test_response.body.result.prompt_compilation_id).toBeTruthy();
    expect(test_response.body.result.action_requests.map((action) => action.action_id)).toEqual(
      expect.arrayContaining(["guardar_nota", "crear_tarea", "generar_resumen", "programar_llamada"]),
    );
    expect(test_response.body.result.actions_ejecutadas.map((action) => action.action_id)).toEqual(
      expect.arrayContaining(["guardar_nota", "crear_tarea", "generar_resumen"]),
    );
    expect(test_response.body.result.actions_ejecutadas.find((action) => action.action_id === "generar_resumen").output.resumen)
      .toContain("Clínica Dental Sonrisa");
    expect(test_response.body.result.guardrail_events_generados.map((event) => event.action_id)).toContain("programar_llamada");

    const notes = await pool.query("SELECT * FROM internal_notes WHERE bot_id = $1", [bot.id]);
    const tasks = await pool.query("SELECT * FROM internal_tasks WHERE bot_id = $1", [bot.id]);
    const audit_logs = await request(app)
      .get(`/internal/action-audit-logs?account_id=${account.id}&bot_id=${bot.id}`)
      .expect(200);

    expect(notes.rows).toHaveLength(1);
    expect(tasks.rows).toHaveLength(1);
    expect(audit_logs.body.logs.filter((log) => log.status === "executed")).toHaveLength(3);
    expect(audit_logs.body.logs.some((log) => log.action_id === "programar_llamada" && log.status === "blocked")).toBe(true);
  });

  it("returns guardrail events for disabled, unknown, confirmation and stub actions", async () => {
    const account_result = await pool.query("SELECT * FROM accounts WHERE slug = 'demo-account' LIMIT 1");
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'operador_comercial_yoayudo' LIMIT 1");
    const account = account_result.rows[0];
    const bot = bot_result.rows[0];

    await request(app)
      .post("/internal/bots/00000000-0000-0000-0000-000000000000/test-message")
      .send({ modo_test: true, mensaje: "hola" })
      .expect(404);

    await request(app)
      .post(`/internal/bots/${bot.id}/test-message`)
      .send({ modo_test: false, mensaje: "hola" })
      .expect(400);

    await request(app)
      .post(`/internal/bots/${bot.id}/test-message`)
      .send({
        organization_id: account.organization_id,
        account_id: account.id,
        modo_test: true,
        action_requests: [
          {
            action_id: "enviar_email",
            input_json: { to: "cliente@example.com", subject: "Seguimiento", body: "Hola" },
          },
          {
            action_id: "accion_inexistente",
            input_json: {},
          },
          {
            action_id: "solicitar_aprobacion_humana",
            input_json: { motivo: "Revisar descuento especial" },
          },
          {
            action_id: "crear_tarea",
            input_json: {},
          },
        ],
      })
      .expect(200);

    await request(app)
      .post(`/internal/bots/${bot.id}/actions/enviar_email`)
      .send({ enabled: true })
      .expect(200);
    await request(app)
      .post(`/internal/bots/${bot.id}/actions/llamar_y_conectar`)
      .send({ enabled: true })
      .expect(200);
    await request(app)
      .post(`/internal/bots/${bot.id}/actions/crear_contacto`)
      .send({ enabled: true })
      .expect(200);

    await request(app)
      .post("/internal/action-executions")
      .send({
        organization_id: account.organization_id,
        account_id: account.id,
        bot_id: bot.id,
        action_id: "guardar_nota",
        actor_type: "bot",
        permisos_disponibles: [],
        input_json: { nota: "Intento sin permiso explícito" },
      })
      .expect(200);

    const confirmation = await request(app)
      .post(`/internal/bots/${bot.id}/test-message`)
      .send({
        organization_id: account.organization_id,
        account_id: account.id,
        modo_test: true,
        action_requests: [
          {
            action_id: "enviar_email",
            input_json: { to: "cliente@example.com", subject: "Seguimiento", body: "Hola" },
          },
        ],
      })
      .expect(200);

    expect(confirmation.body.result.actions_pendientes_confirmacion.map((action) => action.action_id)).toContain("enviar_email");

    await request(app)
      .post(`/internal/bots/${bot.id}/test-message`)
      .send({
        organization_id: account.organization_id,
        account_id: account.id,
        modo_test: true,
        action_requests: [
          {
            action_id: "llamar_y_conectar",
            input_json: { telefono: "555", motivo: "Conectar prospecto con vendedor" },
          },
        ],
      })
      .expect(200);

    const stub_response = await request(app)
      .post(`/internal/bots/${bot.id}/test-message`)
      .send({
        organization_id: account.organization_id,
        account_id: account.id,
        modo_test: true,
        action_requests: [
          {
            action_id: "crear_contacto",
            input_json: { nombre: "Prospecto Demo", telefono: "555" },
          },
        ],
      })
      .expect(200);

    expect(stub_response.body.result.action_results[0].status).toBe("not_implemented");

    const guardrails = await request(app)
      .get(`/internal/guardrail-events?account_id=${account.id}&bot_id=${bot.id}`)
      .expect(200);
    const tipos = guardrails.body.events.map((event) => event.tipo);

    expect(tipos).toContain("accion_no_habilitada");
    expect(tipos).toContain("accion_no_disponible");
    expect(tipos).toContain("input_invalido");
    expect(tipos).toContain("requiere_confirmacion");
    expect(tipos).toContain("riesgo_bloqueado");
    expect(tipos).toContain("permiso_insuficiente");
  });

  it("supports the minimum diagnosticos_ai flow for internal commercial use", async () => {
    const account_result = await pool.query("SELECT * FROM accounts WHERE slug = 'demo-account' LIMIT 1");
    const account = account_result.rows[0];

    const create_response = await request(app)
      .post("/internal/diagnosticos-ai")
      .send({
        organization_id: account.organization_id,
        account_id: account.id,
        negocio_nombre: "Taller El Rayo",
        giro: "taller automotriz",
        contacto_nombre: "Luis",
        contacto_telefono: "555",
        respuestas_entrevista: { llegada_clientes: "WhatsApp y llamadas" },
      })
      .expect(201);
    const diagnostico_id = create_response.body.diagnostico.diagnostico_id;

    const update_response = await request(app)
      .patch(`/internal/diagnosticos-ai/${diagnostico_id}`)
      .send({
        problemas_detectados: ["Pierden seguimiento de cotizaciones."],
        oportunidades_ai: ["Bot de seguimiento comercial."],
        bots_recomendados: ["seguimiento_ventas"],
        acciones_recomendadas: ["crear_tarea", "guardar_nota"],
        precio_mensual_sugerido: 2000,
      })
      .expect(200);

    await request(app)
      .post(`/internal/diagnosticos-ai/${diagnostico_id}/status`)
      .send({ status: "analisis" })
      .expect(200);

    const get_response = await request(app)
      .get(`/internal/diagnosticos-ai/${diagnostico_id}`)
      .expect(200);

    expect(update_response.body.diagnostico.bots_recomendados).toContain("seguimiento_ventas");
    expect(get_response.body.diagnostico.status).toBe("analisis");
  });
});
