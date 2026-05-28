import express from "express";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { register_commercial_routes } from "../../src/commercial/commercial_routes.js";
import { get_agent_package, list_agent_packages } from "../../src/commercial/agent_package_catalog.js";
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

  it("exposes reusable commercial agent packages and action metadata", async () => {
    expect(list_agent_packages()).toHaveLength(7);
    expect(get_agent_package("factura_facil").acciones_requeridas).toContain("extraer_datos_de_imagen");
    expect(get_agent_package("llamadas_y_conexion").habilitado_por_default).toBe(false);

    expect(list_actions().some((action) => action.action_id === "llamar_y_conectar")).toBe(true);
    expect(get_action("llamar_y_conectar")).toMatchObject({
      categoria: "voz",
      habilitada_por_default: false,
    });
    expect(get_action("extraer_datos_de_imagen").input_schema.properties.archivo_id).toBeDefined();

    const packages_response = await request(app).get("/internal/agent-packages?include_disabled=true").expect(200);
    const actions_response = await request(app).get("/internal/actions").expect(200);

    expect(packages_response.body.packages.some((paquete) => paquete.paquete_id === "recepcionista_ai")).toBe(true);
    expect(actions_response.body.actions.some((action) => action.action_id === "crear_tarea")).toBe(true);
  });

  it("creates a bot from a commercial package with enabled actions and base definition", async () => {
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const response = await request(app)
      .post("/internal/bots/from-package")
      .send({
        account_id: account.rows[0].id,
        paquete_id: "seguimiento_ventas",
        name: "Bot Seguimiento Ventas Test",
        slug: "bot-seguimiento-ventas-test",
        status: "active",
      })
      .expect(201);

    expect(response.body.bot.paquete_id).toBe("seguimiento_ventas");
    expect(response.body.bot.bot_type).toBe("custom");
    expect(response.body.bot.enabled_actions_json).toContain("crear_tarea");
    expect(response.body.bot.definition_json.agent_definitions[0].id).toBe("seguimiento_ventas_agent");
    expect(response.body.paquete.knowledge_base_sugerida).toContain("servicios");
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
    expect(propuesta.body.diagnostico.paquete_recomendado).toBe("factura_facil");
    expect(propuesta.body.diagnostico.propuesta_resumen.siguientes_pasos).toContain("Validar knowledge base mínima.");

    const list_response = await request(app)
      .get(`/internal/diagnosticos-ai?organization_id=${organization.rows[0].id}&vendedor_id=vendedor_demo`)
      .expect(200);

    expect(list_response.body.diagnosticos).toHaveLength(1);
  });

  it("keeps action execution safe with pending confirmation and audit log", async () => {
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const pending = await request(app)
      .post("/internal/action-executions")
      .send({
        organization_id: account.rows[0].organization_id,
        account_id: account.rows[0].id,
        action_id: "enviar_email",
        actor_type: "agent",
        input_json: {
          to: "cliente@example.com",
          subject: "Seguimiento",
          body: "Hola",
        },
      })
      .expect(200);

    expect(pending.body.result.status).toBe("pending_confirmation");
    expect(pending.body.result.audit_log.confirmation_required).toBe(true);

    const voice = await request(app)
      .post("/internal/action-executions")
      .send({
        organization_id: account.rows[0].organization_id,
        account_id: account.rows[0].id,
        action_id: "llamar_y_conectar",
        actor_type: "agent",
        input_json: { telefono: "555", motivo: "confirmar cita" },
      })
      .expect(200);

    expect(voice.body.result.status).toBe("solo_humano");

    const logs = await request(app)
      .get(`/internal/action-audit-logs?account_id=${account.rows[0].id}`)
      .expect(200);

    expect(logs.body.logs).toHaveLength(2);
    expect(logs.body.logs.some((log) => log.action_id === "enviar_email")).toBe(true);
  });
});
