import express from "express";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { register_commercial_routes } from "../../src/commercial/commercial_routes.js";
import { get_bot_template, list_bot_templates } from "../../src/bot_engine/bot_template_repository.js";
import { get_action, list_actions } from "../../src/actions/action_registry.js";
import { create_test_pool } from "../helpers/test_pool.js";

function create_commercial_test_app(pool) {
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

describe("commercial platform", () => {
  let pool;
  let app;

  before_each(async () => {
    pool = await create_test_pool();
    app = create_commercial_test_app(pool);
  });

  after_each(async () => {
    await pool?.end();
  });

  it("exposes editable bot templates from DB and action metadata from code", async () => {
    const templates = await list_bot_templates(pool);
    const factura_template = await get_bot_template(pool, "factura_facil");

    expect(templates.length).toBeGreaterThanOrEqual(6);
    expect(factura_template.acciones_sugeridas).toContain("extraer_datos_de_imagen");

    expect(list_actions().some((action) => action.action_id === "llamar_y_conectar")).toBe(true);
    expect(get_action("llamar_y_conectar")).toMatchObject({
      categoria: "voz",
      habilitada_por_default: false,
    });
    expect(get_action("extraer_datos_de_imagen").input_schema.properties.archivo_id).toBeDefined();

    const templates_response = await request(app).get("/internal/bot-templates?include_disabled=true").expect(200);
    const actions_response = await request(app).get("/internal/actions").expect(200);

    expect(templates_response.body.templates.some((template) => template.template_id === "recepcionista_ai")).toBe(true);
    expect(actions_response.body.actions.some((action) => action.action_id === "crear_tarea")).toBe(true);
  });

  it("creates a configurable bot from an editable DB template and compiles a prompt", async () => {
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const response = await request(app)
      .post("/internal/bots")
      .send({
        account_id: account.rows[0].id,
        template_id: "seguimiento_ventas",
        name: "Bot Seguimiento Ventas Test",
        slug: "bot-seguimiento-ventas-test",
        status: "active",
      })
      .expect(201);

    expect(response.body.bot.paquete_id).toBe("seguimiento_ventas");
    expect(response.body.bot.bot_type).toBe("custom");
    expect(response.body.bot.acciones_habilitadas_json).toContain("crear_tarea");
    expect(response.body.bot.prompt_base).toBeNull();
    expect(response.body.bot.instrucciones_operativas).toContain("asistente comercial");
    expect(response.body.bot.definition_json.interactions.map((interaction) => interaction.type)).toEqual(
      expect.arrayContaining(["receive_whatsapp_message", "send_whatsapp_message", "consult_human"]),
    );
    expect(response.body.template.knowledge_base_sugerida).toContain("servicios");

    const compiled = await request(app)
      .post(`/internal/bots/${response.body.bot.id}/compile-prompt`)
      .send({
        business_knowledge: [{ id: "kb-1", title: "Precios", document_family: "business_knowledge", score: 2 }],
        conversation_memory: [{ id: "mem-1", title: "Falta teléfono", document_family: "conversation_memory", score: 2 }],
      })
      .expect(200);

    expect(compiled.body.compiled.prompt).toContain("Acciones disponibles");
    expect(compiled.body.compiled.acciones_disponibles.some((action) => action.action_id === "crear_tarea")).toBe(true);
  });

  it("stores diagnostics and generates a preliminary commercial proposal", async () => {
    const organization = await pool.query("SELECT * FROM organizations LIMIT 1");
    const create_response = await request(app)
      .post("/internal/diagnosticos-ai")
      .send({
        organization_id: organization.rows[0].id,
        negocio_nombre: "Clínica Demo",
        giro: "salud",
        contacto_nombre: "Ana",
        contacto_telefono: "555",
        vendedor_id: "vendedor_demo",
        bots_recomendados: ["factura_facil"],
        respuestas_entrevista: {
          documentos_capturas: "Reciben PDFs y constancias fiscales por WhatsApp.",
        },
      })
      .expect(201);

    const diagnostico_id = create_response.body.diagnostico.diagnostico_id;

    await request(app)
      .post(`/internal/diagnosticos-ai/${diagnostico_id}/status`)
      .send({ status: "analisis" })
      .expect(200);

    const propuesta = await request(app)
      .post(`/internal/diagnosticos-ai/${diagnostico_id}/propuesta-preliminar`)
      .send({})
      .expect(200);

    expect(propuesta.body.diagnostico.status).toBe("propuesta_lista");
    expect(propuesta.body.diagnostico.bots_recomendados).toContain("factura_facil");
    expect(propuesta.body.diagnostico.propuesta_resumen.siguientes_pasos).toContain("Validar knowledge base mínima.");

    const list_response = await request(app)
      .get(`/internal/diagnosticos-ai?organization_id=${organization.rows[0].id}&vendedor_id=vendedor_demo`)
      .expect(200);

    expect(list_response.body.diagnosticos).toHaveLength(1);
  });

  it("keeps action execution safe with pending confirmation, disabled actions and guardrail events", async () => {
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const bot_response = await request(app)
      .post("/internal/bots")
      .send({
        account_id: account.rows[0].id,
        template_id: "recepcionista_ai",
        name: "Bot Guardrails Test",
        slug: "bot-guardrails-test",
        status: "active",
      })
      .expect(201);

    const pending = await request(app)
      .post("/internal/action-executions")
      .send({
        organization_id: account.rows[0].organization_id,
        account_id: account.rows[0].id,
        bot_id: bot_response.body.bot.id,
        action_id: "crear_tarea",
        actor_type: "bot",
        input_json: {
          titulo: "Dar seguimiento",
        },
      })
      .expect(200);

    expect(pending.body.result.status).toBe("blocked");
    expect(pending.body.result.output.message).toContain("no tiene habilitada");

    await request(app)
      .post(`/internal/bots/${bot_response.body.bot.id}/actions/enviar_email`)
      .send({ enabled: true })
      .expect(200);

    const confirmation = await request(app)
      .post("/internal/action-executions")
      .send({
        organization_id: account.rows[0].organization_id,
        account_id: account.rows[0].id,
        bot_id: bot_response.body.bot.id,
        action_id: "enviar_email",
        actor_type: "bot",
        input_json: {
          to: "cliente@example.com",
          subject: "Seguimiento",
          body: "Hola",
        },
      })
      .expect(200);

    expect(confirmation.body.result.status).toBe("pending_confirmation");
    expect(confirmation.body.result.audit_log.confirmation_required).toBe(true);

    const voice = await request(app)
      .post("/internal/action-executions")
      .send({
        organization_id: account.rows[0].organization_id,
        account_id: account.rows[0].id,
        action_id: "llamar_y_conectar",
        actor_type: "bot",
        input_json: { telefono: "555", motivo: "confirmar cita" },
      })
      .expect(200);

    expect(voice.body.result.status).toBe("blocked");

    const logs = await request(app)
      .get(`/internal/action-audit-logs?account_id=${account.rows[0].id}`)
      .expect(200);

    expect(logs.body.logs).toHaveLength(3);
    expect(logs.body.logs.some((log) => log.action_id === "enviar_email")).toBe(true);

    const guardrails = await request(app)
      .get(`/internal/guardrail-events?account_id=${account.rows[0].id}`)
      .expect(200);

    expect(guardrails.body.events.some((event) => event.tipo === "accion_no_habilitada")).toBe(true);
    expect(guardrails.body.events.some((event) => event.tipo === "requiere_confirmacion")).toBe(true);
  });
});
