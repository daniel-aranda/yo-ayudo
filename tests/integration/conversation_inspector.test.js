import express from "express";
import path from "node:path";
import { rmSync as rm_sync } from "node:fs";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { create_simulated_whatsapp_payload } from "../../src/channels/whatsapp/whatsapp_message_parser.js";
import { resolve_whatsapp_identity_by_phone_number_id } from "../../src/channels/whatsapp/whatsapp_identity_resolver.js";
import { handle_whatsapp_webhook_payload } from "../../src/engine/message_processor.js";
import { register_inspector_routes } from "../../src/inspector/inspector_routes.js";
import { config } from "../../src/app/config.js";
import { navigation_context } from "../../src/app/navigation_middleware.js";
import { json_text, message_alignment, present_conversation_turns, format_phone } from "../../src/inspector/inspector_presenter.js";
import { compact_trace_summary } from "../../src/inspector/inspector_presenter.js";
import { seed_demo_conversation, seed_routed_demo_conversation } from "../../src/db/seed.js";
import { build_message_trace } from "../../src/inspector/trace_builder.js";
import { get_conversation_view } from "../../src/inspector/inspector_repository.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { format_money } from "../../src/shared/money.js";
import { format_date_es, format_datetime_es } from "../../src/shared/dates.js";
import { create_test_pool } from "../helpers/test_pool.js";

class fake_whatsapp_client {
  sent_messages = [];

  async send_text(input) {
    this.sent_messages.push(input);
    return {
      sent: true,
      external_message_id: `fake-${this.sent_messages.length}`,
      raw_response: { ok: true },
    };
  }

  async send_template() {
    return {
      sent: false,
      raw_response: { skipped: true },
    };
  }
}

async function simulate(pool, client, text, options = {}) {
  return handle_whatsapp_webhook_payload(
    create_simulated_whatsapp_payload({
      from: "5215550000000",
      text,
      message_id: options.message_id,
    }),
    {
      pool,
      provider: new mock_provider(),
      whatsapp_client: client,
      memory_store: new local_memory_store({ base_dir: ".storage/test-inspector-memory" }),
    },
  );
}

async function enable_collection(pool, { auto_generate = false } = {}) {
  const row = (
    await pool.query(
      `SELECT b.id, b.definition_json FROM whatsapp_phone_numbers w
       JOIN phone_number_bot_assignments a ON a.whatsapp_phone_number_id = w.id AND a.status = 'active' AND a.active_key = 'active'
       JOIN bots b ON b.id = a.bot_id
       WHERE w.phone_number_id = $1 LIMIT 1`,
      [config.whatsapp_phone_number_id],
    )
  ).rows[0];
  const interactions = [
    {
      type: "recolectar_informacion",
      action_id: "recolectar_informacion",
      enabled: true,
      instructions: "Arma una propuesta de bot para el negocio del vendedor.",
      options: { generar_documento_al_terminar: auto_generate },
    },
    { type: "generar_documento", action_id: "generar_documento", enabled: true, instructions: "" },
  ];
  const definition = { ...(row.definition_json ?? {}), interactions };
  await pool.query("UPDATE bots SET definition_json = $2::jsonb, acciones_habilitadas_json = $3::jsonb WHERE id = $1", [
    row.id,
    JSON.stringify(definition),
    JSON.stringify(["recolectar_informacion", "generar_documento"]),
  ]);
  return row.id;
}

function create_inspector_test_app(pool, dependencies = {}) {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.date = format_date_es;
  app.locals.datetime = format_datetime_es;
  app.locals.json = json_text;
  app.locals.message_alignment = message_alignment;
  app.locals.phone = format_phone;
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(navigation_context);

  register_inspector_routes(router, { pool, ...dependencies });
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });

  return app;
}

async function seed_minimal_message(pool) {
  const context = await pool.query(`
    SELECT
      accounts.id AS account_id,
      accounts.organization_id AS organization_id,
      contacts.id AS contact_id,
      bots.id AS bot_id
    FROM accounts
    JOIN contacts ON contacts.account_id = accounts.id
    JOIN bots ON bots.account_id = accounts.id
    LIMIT 1
  `);
  const row = context.rows[0];
  const conversation = await pool.query(
    `
      INSERT INTO conversations (account_id, organization_id, bot_id, contact_id, channel, last_message_at)
      VALUES ($1, $2, $3, $4, 'whatsapp', now())
      RETURNING *
    `,
    [row.account_id, row.organization_id, row.bot_id, row.contact_id],
  );
  const message = await pool.query(
    `
      INSERT INTO messages (
        account_id,
        organization_id,
        bot_id,
        conversation_id,
        contact_id,
        direction,
        external_message_id,
        raw_payload_json,
        text_body,
        processing_status
      )
      VALUES ($1, $2, $3, $4, $5, 'inbound', 'manual-inspector-test', $6::jsonb, 'hola', 'stored')
      RETURNING *
    `,
    [
      row.account_id,
      row.organization_id,
      row.bot_id,
      conversation.rows[0].id,
      row.contact_id,
      JSON.stringify({ source: "test" }),
    ],
  );

  return message.rows[0];
}

describe("Conversation Inspector", () => {
  let pool;
  let client;

  before_each(async () => {
    rm_sync(".storage/test-inspector-memory", { recursive: true, force: true });
    pool = await create_test_pool();
    client = new fake_whatsapp_client();
  });

  after_each(async () => {
    await pool?.end();
    rm_sync(".storage/test-inspector-memory", { recursive: true, force: true });
  });

  it("builds a message trace with parsing, memory, operation write and outbound response", async () => {
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan");

    const message_result = await pool.query(
      "SELECT * FROM messages WHERE direction = 'inbound' AND parsed_intent = 'purchase' LIMIT 1",
    );
    const trace = await build_message_trace(pool, { message_id: message_result.rows[0].id });

    expect(trace.message.text_body).toContain("pastor");
    expect(trace.parsing_results[0].intent).toBe("purchase");
    // No legacy agent router: the deterministic parser routes straight to the action flow.
    expect(trace.router_runs).toEqual([]);
    expect(trace.memory_documents[0].status).toBe("stored");
    expect(trace.operational_writes.some((write) => write.type === "purchase")).toBe(true);
    expect(trace.outbound_responses[0].text_body).toContain("Compra registrada");
    expect(trace.processing_events.some((event) => event.event_stage === "operation_write")).toBe(true);
    expect(trace.routing_events[0].details_json.classification.mode).toBe("ai_requested");
    expect(trace.routing_events[0].details_json.operations[0]).toMatchObject({
      intent: "purchase",
      action_id: "registrar_compra",
      needs_review: false,
    });
  });

  it("builds a trace when optional pipeline sections are missing", async () => {
    const message = await seed_minimal_message(pool);
    const trace = await build_message_trace(pool, { message_id: message.id });

    expect(trace.message.id).toBe(message.id);
    expect(trace.parsing_results).toEqual([]);
    expect(trace.router_runs).toEqual([]);
    expect(trace.memory_documents).toEqual([]);
    expect(trace.operational_writes).toEqual([]);
    expect(trace.compact_trace_summary.has_error).toBe(false);
  });

  it("marks compact summaries with failed agent runs and pending reviews", () => {
    const summary = compact_trace_summary({
      message: { parsed_intent: "unknown" },
      parsing_results: [],
      router_runs: [],
      agent_runs: [{ status: "failed" }],
      memory_documents: [],
      review_items: [{ status: "pending" }],
      processing_events: [],
    });

    expect(summary.has_error).toBe(true);
    expect(summary.review_status).toBe("pending");
  });

  it("returns conversation view data without mixing bots", async () => {
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan");
    const conversation = await pool.query("SELECT * FROM conversations LIMIT 1");
    const view = await get_conversation_view(pool, conversation.rows[0].id);

    expect(view.conversation.bot_name).toBe("Agente WhatsApp YoAyudo");
    expect(view.conversation.bot_display_phone_number).toBe("+525555999999");
    expect(view.messages).toHaveLength(2);
    expect(view.value_summary.purchases.count).toBe(1);
    // No legacy agent routing; the inbound message is the parsed purchase.
    expect(view.messages[0].compact_trace_summary.selected_agent).toBeFalsy();
    expect(view.messages[0].message.parsed_intent).toBe("purchase");
    expect(view.messages[1].message.direction).toBe("outbound");
  });

  it("renders inspector home, conversation and message trace routes", async () => {
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan");
    const ids = await pool.query(`
      SELECT
        bots.id AS bot_id,
        bots.account_id AS account_id,
        conversations.id AS conversation_id,
        messages.id AS message_id
      FROM bots
      JOIN conversations ON conversations.bot_id = bots.id
      JOIN messages ON messages.conversation_id = conversations.id
      WHERE messages.direction = 'inbound'
      LIMIT 1
    `);
    const app = create_inspector_test_app(pool);

    // El inspector siempre es por cuenta: /inspector sin cuenta cae al overview
    // cross-account de bots (/admin/bots), no al dashboard (parecía link roto).
    await request(app).get("/inspector").expect(302).expect("Location", "/admin/bots");
    await request(app)
      .get(`/inspector/accounts/${ids.rows[0].account_id}`)
      .expect(200)
      .expect(/Inspector por bots/);
    await request(app)
      .get(`/inspector/bots/${ids.rows[0].bot_id}?saved=1`)
      .expect(302)
      .expect("Location", `/inspector/bots/${ids.rows[0].bot_id}`);
    const bot_page = await request(app).get(`/inspector/bots/${ids.rows[0].bot_id}`).expect(200).expect(/Agente WhatsApp YoAyudo/);
    expect(bot_page.text).toContain("Identidad del agente");
    expect(bot_page.text).toContain("Instrucciones operativas");
    expect(bot_page.text).toContain("bot-editor-tabs");
    expect(bot_page.text).toContain('data-section="identidad"');
    expect(bot_page.text).toContain('data-section="probar"');
    expect(bot_page.text).toContain('data-section="knowledge"');
    expect(bot_page.text).toContain('data-section="interacciones"');
    expect(bot_page.text).toContain('data-section="restricciones"');
    expect(bot_page.text).toContain("TabNavigator");
    // "Acciones del bot" was unified into Interacciones; the standalone section is gone.
    expect(bot_page.text).not.toContain("Acciones del bot");
    // Executable capabilities now render as interactions (each with its own prompt).
    expect(bot_page.text).toContain("Buscar negocios");
    // Activity / status view is linked from the editor and renders.
    expect(bot_page.text).toContain(`/inspector/bots/${ids.rows[0].bot_id}/activity`);
    const activity_page = await request(app)
      .get(`/inspector/bots/${ids.rows[0].bot_id}/activity`)
      .expect(200);
    expect(activity_page.text).toContain("Actividad del agente");
    expect(activity_page.text).toContain("Ejecuciones recientes");
    expect(bot_page.text).toContain("Knowledge");
    expect(bot_page.text).toContain("Ir a Knowledge Center");
    expect(bot_page.text).toContain(`href="/inspector/accounts/${ids.rows[0].account_id}/knowledge"`);
    expect(bot_page.text).toContain('id="open_knowledge_picker"');
    expect(bot_page.text).toContain("data-knowledge-picker-popup");
    expect(bot_page.text).toContain("Interacciones");
    expect(bot_page.text).toContain("Grupos humanos");
    // Multi-select de grupos: checkboxes (no un dropdown de un solo valor).
    expect(bot_page.text).toContain("human-group-multi");
    expect(bot_page.text).toContain("data-human-group");
    expect(bot_page.text).toContain("Founder");
    expect(bot_page.text).toContain("Ventas");
    expect(bot_page.text).toContain("Soporte");
    expect(bot_page.text).toContain("Restricciones");
    expect(bot_page.text).toContain("Probar bot");
    expect(bot_page.text).toContain("Mensaje de prueba");
    expect(bot_page.text).toContain("run_bot_test");
    expect(bot_page.text).toContain("Canales");
    expect(bot_page.text).toContain("WhatsApp");
    expect(bot_page.text).toContain("whatsapp_display_phone_number");
    expect(bot_page.text).toContain("ai_model_selection");
    expect(bot_page.text).toContain("OpenAI");
    expect(bot_page.text).toContain("GPT 5.5");
    expect(bot_page.text).toContain("GPT 5.2 económico");
    expect(bot_page.text).toContain("Conversaciones recientes");
    expect(bot_page.text).toContain("Ver settings JSON");
    expect(bot_page.text).toContain("autosave-indicator");
    expect(bot_page.text).toContain("Bot_Editor_Autosave");
    expect(bot_page.text).not.toContain("Canales / accounts asignados");
    expect(bot_page.text).not.toContain(">internal<");
    expect(bot_page.text).not.toContain('name="ai_provider"');
    expect(bot_page.text).not.toContain("Selecciona grupos humanos");
    for (const legacy_text of [
      "Prompt base",
      "Capacidades",
      "Reglas de dispatch",
      "Steps",
      "Intents soportados",
      "Intents",
      "Handoff humano",
      "Routing",
      "Triggers",
      "Formato",
      "Máximo de caracteres",
      "Workers",
      "Sub-agentes",
      "Agent workers",
      "knowledge_search",
      "Crear texto",
      "Subir documento",
      "Agregar URL",
      "Seleccionar existente",
    ]) {
      expect(bot_page.text).not.toContain(legacy_text);
    }
    const conversation_page = await request(app)
      .get(`/inspector/accounts/${ids.rows[0].account_id}/conversations/${ids.rows[0].conversation_id}`)
      .expect(200);
    // Minimal view: the action label chip + the intent in the click popover.
    expect(conversation_page.text).toContain("turn-action-chip");
    expect(conversation_page.text).toContain("Intención");
    expect(conversation_page.text).toContain("conv-summary");
    // Sidebar: contact/channel + value artifacts, no redundant low-value panels.
    expect(conversation_page.text).toContain("Contacto y canal");
    expect(conversation_page.text).toContain("Número del bot");
    expect(conversation_page.text).toContain("Valor capturado");
    expect(conversation_page.text).toContain("Compras");
    expect(conversation_page.text).not.toContain("Diagnóstico");
    expect(conversation_page.text).not.toContain("Acciones rápidas");
    await request(app)
      .get(`/inspector/messages/${ids.rows[0].message_id}`)
      .expect(200)
      .expect(/Escrituras operativas/)
      .expect(/Compra registrada/)
      // The deterministic bot still routes: the routing tab explains the
      // intent→interaction decision instead of showing an empty state.
      .expect(/Ruteo determinístico por intención/);
  });

  it("scopes the inspector to a single account via path param (legacy ?account= redirects)", async () => {
    await simulate(pool, client, "hola");
    const account = (
      await pool.query(`
        SELECT accounts.id, accounts.name, organizations.name AS organization_name
        FROM accounts
        JOIN organizations ON organizations.id = accounts.organization_id
        JOIN bots ON bots.account_id = accounts.id
        LIMIT 1
      `)
    ).rows[0];
    const app = create_inspector_test_app(pool);

    // Legacy ?account= redirects to the canonical path (scope lives in the path now).
    await request(app)
      .get(`/inspector?account=${account.id}`)
      .expect(302)
      .expect("Location", `/inspector/accounts/${account.id}`);

    // Scoped path: muestra el header de la cuenta (siempre es por cuenta).
    const scoped = await request(app).get(`/inspector/accounts/${account.id}`).expect(200);
    expect(scoped.text).toContain(account.name);
    expect(scoped.text).toContain("Inspector por bots");
    // Ya no hay vista global ni banner de "ver todos los bots".
    expect(scoped.text).not.toContain("scope-banner");
    expect(scoped.text).not.toContain("Ver todos los bots");

    // Sin cuenta: el inspector cae al overview cross-account de bots (/admin/bots).
    await request(app).get("/inspector").expect(302).expect("Location", "/admin/bots");
  });

  it("seeds a multi-execution demo conversation (a single turn fires more than one interaction)", async () => {
    const bot = (
      await pool.query("SELECT id, account_id, organization_id FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")
    ).rows[0];
    await seed_demo_conversation(pool, {
      account_id: bot.account_id,
      organization_id: bot.organization_id,
      bot_id: bot.id,
    });
    const conversation = (
      await pool.query(
        `SELECT c.id FROM conversations c
         JOIN contacts ct ON ct.id = c.contact_id
         WHERE ct.whatsapp_phone = '5215550000111' AND c.bot_id = $1 LIMIT 1`,
        [bot.id],
      )
    ).rows[0];

    const view = await get_conversation_view(pool, conversation.id);
    const turns = present_conversation_turns(view.turns);
    const multi = turns.filter((turn) => turn.understanding && turn.understanding.actions.length > 1);

    expect(multi.length).toBeGreaterThanOrEqual(1);
    expect(multi[0].understanding.actions.map((action) => action.label)).toEqual(
      expect.arrayContaining(["Registrar venta", "Registrar compra"]),
    );
  });

  it("seeds an agent-routed demo conversation (router picks a specialized agent per message)", async () => {
    const bot = (
      await pool.query("SELECT id, account_id, organization_id FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")
    ).rows[0];
    await seed_routed_demo_conversation(pool, {
      account_id: bot.account_id,
      organization_id: bot.organization_id,
      bot_id: bot.id,
    });
    const message = (
      await pool.query(
        `SELECT m.id FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN contacts ct ON ct.id = c.contact_id
         WHERE ct.whatsapp_phone = '5215550000222' AND m.direction = 'inbound' AND m.parsed_intent = 'report_request'
         LIMIT 1`,
      )
    ).rows[0];

    const trace = await build_message_trace(pool, { message_id: message.id });
    // The "Ruteo" tab reads router_runs (agent_runs run_type='route') + agent_runs.
    expect(trace.router_runs.length).toBeGreaterThanOrEqual(1);
    expect(trace.router_runs[0].agent_key).toBe("reports_agent");
    expect(Number(trace.router_runs[0].routing_confidence)).toBeGreaterThan(0.8);
    expect(trace.agent_runs.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the per-bot conversations list as a compact inbox with interaction chips", async () => {
    const app = create_inspector_test_app(pool);
    const bot = (
      await pool.query("SELECT id, account_id, organization_id FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")
    ).rows[0];
    await seed_routed_demo_conversation(pool, {
      account_id: bot.account_id,
      organization_id: bot.organization_id,
      bot_id: bot.id,
    });

    const page = await request(app).get(`/inspector/bots/${bot.id}/conversations`).expect(200);

    // La vista por bot usa la misma bandeja compacta que dashboard/editor:
    // previews de dos líneas, tarjetas clickeables y rollup arriba.
    expect(page.text).toContain("conversation-rollup");
    expect(page.text).toContain("bandeja-conversaciones");
    expect(page.text).toContain("multi-interacción");
    expect(page.text).not.toContain("Last intent");
    expect(page.text).not.toContain("Last agent");

    // Las interacciones ejecutadas (action_audit_logs status='executed') se
    // muestran como chips con etiqueta humana — reemplazan intent/agent crudos.
    expect(page.text).toContain("conversacion-chip");
    expect(page.text).toContain("Requiere seguimiento");
    expect(page.text).toContain("Caja inicial");

    // Última actividad = fecha corta, no el Date crudo con zona horaria.
    expect(page.text).not.toContain("GMT");
    expect(page.text).not.toContain("Standard Time");
  });

  it("renders information collection as a stateful interaction, not as action-less turns", async () => {
    const app = create_inspector_test_app(pool);
    const bot_id = await enable_collection(pool);
    await simulate(pool, client, "arma una propuesta para mi negocio", { message_id: "inspector-collection-start" });
    await simulate(pool, client, "pierdo clientes porque no contestamos rápido", {
      message_id: "inspector-collection-followup",
    });
    await simulate(pool, client, "ya con eso, gracias", { message_id: "inspector-collection-ready" });
    const ids = (
      await pool.query(
        `
          SELECT
            messages.id AS message_id,
            messages.account_id,
            messages.conversation_id
          FROM messages
          WHERE messages.external_message_id = 'inspector-collection-start'
          LIMIT 1
        `,
      )
    ).rows[0];

    const view = await get_conversation_view(pool, ids.conversation_id);
    const turns = present_conversation_turns(view.turns);
    expect(turns.map((turn) => turn.understanding?.actions?.[0]?.label).filter(Boolean)).toEqual([
      "Inicia recolección",
      "Seguimiento de recolección",
      "Recolección lista",
    ]);
    expect(view.collection_session.status).toBe("ready");

    const page = await request(app)
      .get(`/inspector/accounts/${ids.account_id}/conversations/${ids.conversation_id}`)
      .expect(200);
    expect(page.text).toContain("Inicia recolección");
    expect(page.text).toContain("Seguimiento de recolección");
    expect(page.text).toContain("Recolección lista");
    expect(page.text).not.toContain("Sin acción ejecutada");

    const list = await request(app).get(`/inspector/bots/${bot_id}/conversations`).expect(200);
    expect(list.text).toContain("Recolección");

    await request(app)
      .get(`/inspector/messages/${ids.message_id}`)
      .expect(200)
      .expect(/Inicia recolección/)
      .expect(/interacción stateful/)
      .expect(/no generó action_audit_logs/);
  });

  it("surfaces the bot-created task in the conversation visor (closes the human follow-up loop)", async () => {
    const app = create_inspector_test_app(pool);
    const bot = (
      await pool.query("SELECT id, account_id, organization_id FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")
    ).rows[0];
    await seed_routed_demo_conversation(pool, {
      account_id: bot.account_id,
      organization_id: bot.organization_id,
      bot_id: bot.id,
    });
    const conversation = (
      await pool.query(
        `SELECT c.id FROM conversations c
         JOIN contacts ct ON ct.id = c.contact_id
         WHERE ct.whatsapp_phone = '5215550000222' LIMIT 1`,
      )
    ).rows[0];
    expect(conversation).toBeTruthy();

    // La URL plana legacy redirige al canónico con la cuenta en el path.
    await request(app)
      .get(`/inspector/conversations/${conversation.id}`)
      .expect(302)
      .expect("Location", `/inspector/accounts/${bot.account_id}/conversations/${conversation.id}`);

    const page = await request(app)
      .get(`/inspector/accounts/${bot.account_id}/conversations/${conversation.id}`)
      .expect(200);
    // La interacción crear_tarea dejó una tarea real; el panel slim la muestra
    // (título + estado) y al hacer click abre el detalle en popup (data-open-task).
    expect(page.text).toContain("Llamar al cliente");
    expect(page.text).toContain("conv-task-row");
    expect(page.text).toContain("Consultar humano");
    const task = (
      await pool.query("SELECT id FROM internal_tasks WHERE titulo LIKE 'Llamar al cliente%' LIMIT 1")
    ).rows[0];
    expect(page.text).toContain(`data-open-task="${task.id}"`);
    expect(page.text).toContain("turn-action-combo");
    expect(page.text).toContain("turn-task-button");
  });

  it("shows Instagram as a connected channel (parity with WhatsApp) for the seeded agent", async () => {
    const app = create_inspector_test_app(pool);
    const bot = (await pool.query("SELECT id FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")).rows[0];
    const page = await request(app).get(`/inspector/bots/${bot.id}`).expect(200);
    expect(page.text).toContain("Instagram");
    expect(page.text).toContain("yoayudo.ventas");
    // Both channels are seeded for this agent, so the Canales tab shows them connected.
    expect(page.text).toContain('name="instagram_username"');
  });

  it("saves structured bot builder fields without editing raw JSON", async () => {
    const app = create_inspector_test_app(pool);
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1");
    const bot_id = bot_result.rows[0].id;

    const save_response = await request(app)
      .post(`/inspector/bots/${bot_id}`)
      .type("form")
      .send({
        name: "Agente WhatsApp Editado",
        description: "Editor estructurado funcionando.",
        goal: "Operar ventas internas desde configuración.",
        status: "active",
        bot_type: "custom",
        behavior_language: "es-MX",
        behavior_tone: "direct",
        ai_model_selection: "openai:gpt-5.5",
        instrucciones_operativas: "Instrucciones actualizadas desde builder.",
        constraints_text: "No fingir llamadas.",
        whatsapp_display_phone_number: "+525512345678",
        whatsapp_phone_number_id: "155512345678",
        interaction_type: ["receive_whatsapp_message", "buscar_negocios"],
        interaction_instructions: ["Atender dudas comerciales.", "Prospecta clientes ideales y excluye los ya contactados."],
        interaction_human_group_ids: ["", ""],
        interaction_enabled: ["0", "1"],
        interaction_option_read_attachments: "0",
        new_interaction_type: "consult_human",
        new_interaction_instructions: "Consultar a humano ante alcance custom.",
        new_interaction_human_group_ids: "ventas",
      })
      .expect(302);
    expect(save_response.headers.location).toBe(`/inspector/bots/${bot_id}`);

    const updated = await pool.query("SELECT * FROM bots WHERE id = $1", [bot_id]);
    expect(updated.rows[0].name).toBe("Agente WhatsApp Editado");
    expect(updated.rows[0].definition_json.identity).toMatchObject({
      name: "Agente WhatsApp Editado",
      description: "Editor estructurado funcionando.",
      goal: "Operar ventas internas desde configuración.",
    });
    expect(updated.rows[0].definition_json.behavior).toMatchObject({
      language: "es-MX",
      tone: "direct",
      operating_instructions: "Instrucciones actualizadas desde builder.",
      constraints: "No fingir llamadas.",
    });
    expect(updated.rows[0].definition_json.ai).toMatchObject({
      provider: "openai",
      model: "gpt-5.5",
    });
    expect(updated.rows[0].definition_json.interactions[0]).toMatchObject({
      key: "receive_whatsapp_message",
      type: "receive_whatsapp_message",
      label: "Recibir mensajes de WhatsApp",
      enabled: true,
      instructions: "Atender dudas comerciales.",
    });
    // "Entender adjuntos" sub-option is opt-in and parsed per interaction index.
    expect(updated.rows[0].definition_json.interactions[0].options).toEqual({ read_attachments: true });
    expect(updated.rows[0].definition_json.interactions[1]).toMatchObject({
      key: "buscar_negocios",
      type: "buscar_negocios",
      label: "Buscar negocios",
      enabled: true,
      action_id: "buscar_negocios",
      instructions: "Prospecta clientes ideales y excluye los ya contactados.",
    });
    expect(updated.rows[0].definition_json.interactions[2]).toMatchObject({
      key: "consult_human",
      type: "consult_human",
      label: "Consultar humano",
      enabled: true,
      instructions: "Consultar a humano ante alcance custom.",
      human_group_ids: ["ventas"],
    });
    // acciones_habilitadas is derived from the enabled interactions that carry an action_id.
    expect(updated.rows[0].acciones_habilitadas_json).toEqual(["buscar_negocios"]);

    const whatsapp_assignment = await pool.query(
      `
        SELECT
          whatsapp_phone_numbers.display_phone_number,
          whatsapp_phone_numbers.phone_number_id,
          phone_number_bot_assignments.bot_id,
          phone_number_bot_assignments.status
        FROM whatsapp_phone_numbers
        JOIN phone_number_bot_assignments
          ON phone_number_bot_assignments.whatsapp_phone_number_id = whatsapp_phone_numbers.id
        WHERE whatsapp_phone_numbers.phone_number_id = '155512345678'
        LIMIT 1
      `,
    );

    expect(whatsapp_assignment.rows[0]).toMatchObject({
      display_phone_number: "+525512345678",
      phone_number_id: "155512345678",
      bot_id,
      status: "active",
    });

    const resolved_identity = await resolve_whatsapp_identity_by_phone_number_id(pool, "155512345678");
    expect(resolved_identity.bot.id).toBe(bot_id);
    expect(resolved_identity.whatsapp_phone_number.display_phone_number).toBe("+525512345678");
  });

  it("assigns multiple human groups to a consult_human interaction (multi-select, comma-joined)", async () => {
    const app = create_inspector_test_app(pool);
    const bot_id = (await pool.query("SELECT id FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")).rows[0].id;

    // El editor renderiza el multi-select de grupos como checkboxes + hidden input.
    const page = await request(app).get(`/inspector/bots/${bot_id}`).expect(200);
    expect(page.text).toContain("human-group-multi");
    expect(page.text).toContain("data-human-group");

    // Cada interacción manda UN campo interaction_human_group_ids con los ids
    // comma-joined; el server los separa y valida (multiples grupos por interacción).
    await request(app)
      .post(`/inspector/bots/${bot_id}`)
      .type("form")
      .send({
        name: "Agente multi-grupo",
        goal: "Escalar a varios equipos.",
        status: "active",
        bot_type: "custom",
        behavior_language: "es-MX",
        behavior_tone: "direct",
        instrucciones_operativas: "Atiende y escala.",
        constraints_text: "No fingir.",
        interactions_present: "1",
        interaction_type: ["consult_human"],
        interaction_instructions: ["Escala a los equipos correctos."],
        interaction_human_group_ids: ["ventas,soporte,founder"],
        interaction_enabled: ["0"],
      })
      .expect(302);

    const updated = await pool.query("SELECT definition_json FROM bots WHERE id = $1", [bot_id]);
    const consult = updated.rows[0].definition_json.interactions.find((i) => i.type === "consult_human");
    expect(consult.human_group_ids).toEqual(["ventas", "soporte", "founder"]);

    // Ids inválidos se descartan; sin grupos válidos queda lista vacía.
    await request(app)
      .post(`/inspector/bots/${bot_id}`)
      .type("form")
      .send({
        name: "Agente multi-grupo",
        goal: "Escalar a varios equipos.",
        status: "active",
        bot_type: "custom",
        behavior_language: "es-MX",
        behavior_tone: "direct",
        instrucciones_operativas: "Atiende y escala.",
        constraints_text: "No fingir.",
        interactions_present: "1",
        interaction_type: ["consult_human"],
        interaction_instructions: ["Escala a los equipos correctos."],
        interaction_human_group_ids: ["no-existe,otro-invalido"],
        interaction_enabled: ["0"],
      })
      .expect(302);
    const cleared = await pool.query("SELECT definition_json FROM bots WHERE id = $1", [bot_id]);
    expect(cleared.rows[0].definition_json.interactions.find((i) => i.type === "consult_human").human_group_ids).toEqual([]);
  });

  it("autosaves bot builder fields through the JSON route", async () => {
    const app = create_inspector_test_app(pool);
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1");
    const bot_id = bot_result.rows[0].id;

    const autosave_response = await request(app)
      .post(`/inspector/bots/${bot_id}`)
      .set("Accept", "application/json")
      .set("X-Requested-With", "XMLHttpRequest")
      .type("form")
      .send({
        name: "Agente Autosave",
        description: "Descripcion guardada por autosave.",
        goal: "Validar autosave en editor.",
        status: "active",
        bot_type: "custom",
        behavior_language: "es-MX",
        behavior_tone: "commercial",
        ai_model_selection: "openai:gpt-5.2",
        instrucciones_operativas: "Autosave actualizo instrucciones.",
        constraints_text: "Autosave no debe romper el editor.",
      })
      .expect(200);

    expect(autosave_response.body).toMatchObject({
      ok: true,
      bot: {
        id: bot_id,
        name: "Agente Autosave",
      },
    });

    const updated = await pool.query("SELECT name, definition_json FROM bots WHERE id = $1", [bot_id]);
    expect(updated.rows[0].name).toBe("Agente Autosave");
    expect(updated.rows[0].definition_json.identity.description).toBe("Descripcion guardada por autosave.");
    expect(updated.rows[0].definition_json.ai).toMatchObject({
      provider: "openai",
      model: "gpt-5.2",
    });
  });

  it("shows an empty interaction state and prevents duplicate interactions", async () => {
    const app = create_inspector_test_app(pool);
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1");
    const bot = bot_result.rows[0];
    const definition = {
      ...bot.definition_json,
      interactions: [],
    };

    await pool.query("UPDATE bots SET definition_json = $2::jsonb WHERE id = $1", [bot.id, JSON.stringify(definition)]);

    const empty_page = await request(app).get(`/inspector/bots/${bot.id}`).expect(200);
    expect(empty_page.text).toContain("Ninguna interacción configurada.");
    expect(empty_page.text).toContain("Agregar interacción");
    expect(empty_page.text).toContain("Enviar mensaje de WhatsApp");
    expect(empty_page.text).toContain("Recibir mensajes de WhatsApp");
    expect(empty_page.text).toContain("Consultar humano");
    expect(empty_page.text).toContain("Buscar negocios");

    await request(app)
      .post(`/inspector/bots/${bot.id}`)
      .type("form")
      .send({
        name: "Agente WhatsApp YoAyudo",
        description: "Editor estructurado funcionando.",
        goal: "Operar ventas internas desde configuración.",
        status: "active",
        bot_type: "custom",
        behavior_language: "es-MX",
        behavior_tone: "professional",
        instrucciones_operativas: "Instrucciones actualizadas desde builder.",
        constraints_text: "No fingir llamadas.",
        interaction_type: ["send_whatsapp_message"],
        interaction_instructions: ["Enviar solo mensajes útiles."],
        interaction_human_group_ids: [""],
        interaction_enabled: ["0"],
        new_interaction_type: "send_whatsapp_message",
        new_interaction_instructions: "Intento duplicado.",
      })
      .expect(302);

    const updated = await pool.query("SELECT definition_json FROM bots WHERE id = $1", [bot.id]);
    const send_interactions = updated.rows[0].definition_json.interactions.filter(
      (interaction) => interaction.type === "send_whatsapp_message",
    );

    expect(send_interactions).toHaveLength(1);
    expect(send_interactions[0].instructions).toBe("Enviar solo mensajes útiles.");
  });

  it("serves a minimal knowledge center and lets agents assign existing knowledge", async () => {
    const app = create_inspector_test_app(pool);
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1");
    const bot = bot_result.rows[0];

    await request(app)
      .post(`/inspector/accounts/${bot.account_id}/knowledge`)
      .type("form")
      .send({
        source_type: "text",
        scope: "account",
        name: "Knowledge Founder Test",
        description: "Notas para ventas founder.",
        content: "YoAyudo ayuda a negocios a operar ventas por WhatsApp.",
      })
      .expect(302)
      .expect("Location", `/inspector/accounts/${bot.account_id}/knowledge`);

    await request(app)
      .get(`/inspector/accounts/${bot.account_id}/knowledge`)
      .expect(200)
      .expect(/Knowledge Center/)
      .expect(/Agregar knowledge/)
      .expect(/Knowledge existente/)
      .expect(/Knowledge Founder Test/);

    const source = await pool.query("SELECT * FROM knowledge_sources WHERE name = 'Knowledge Founder Test' LIMIT 1");

    expect(source.rows[0].organization_id).toBe(bot.organization_id);
    expect(source.rows[0].account_id).toBe(bot.account_id);

    const knowledge_page = await request(app).get(`/inspector/accounts/${bot.account_id}/knowledge`).expect(200);
    expect(knowledge_page.text).toContain('id="knowledge_form_panel" hidden');
    expect(knowledge_page.text).toContain('value="text" checked');
    expect(knowledge_page.text).toContain('value="document"');
    expect(knowledge_page.text).toContain('value="url"');
    expect(knowledge_page.text).toContain('type="file"');
    expect(knowledge_page.text).toContain("Máx 10MB");
    expect(knowledge_page.text).toContain("Cancelar");
    expect(knowledge_page.text).toContain("Knowledge");
    expect(knowledge_page.text).toContain("Texto");
    expect(knowledge_page.text).toContain(`action="/inspector/accounts/${bot.account_id}/knowledge"`);
    expect(knowledge_page.text).toContain(`/inspector/accounts/${bot.account_id}/knowledge/${source.rows[0].id}`);

    await request(app)
      .get(`/inspector/knowledge?organization_id=00000000-0000-0000-0000-000000000001&account_id=${bot.account_id}`)
      .expect(302)
      .expect("Location", `/inspector/accounts/${bot.account_id}/knowledge`);

    await request(app)
      .get(`/inspector/knowledge/${source.rows[0].id}`)
      .expect(302)
      .expect("Location", `/inspector/accounts/${bot.account_id}/knowledge/${source.rows[0].id}`);

    const global_knowledge_page = await request(app).get("/inspector/knowledge").expect(200);
    expect(global_knowledge_page.text).toContain("Knowledge Founder Test");

    const knowledge_detail_page = await request(app)
      .get(`/inspector/accounts/${bot.account_id}/knowledge/${source.rows[0].id}`)
      .expect(200)
      .expect(/Knowledge Founder Test/)
      .expect(/Notas para ventas founder/)
      .expect(/Volver/)
      .expect(/Guardar cambios/)
      .expect(/Tipo de knowledge/)
      .expect(/Knowledge/)
      .expect(/show_knowledge_preview/)
      .expect(/show_knowledge_source/)
      .expect(/knowledge_preview/)
      .expect(/knowledge_source_body/)
      .expect(/Metadata/);
    expect(knowledge_detail_page.text).toContain("trimmed.match(/^(#+)\\s+(.+)$/)");
    expect(knowledge_detail_page.text).not.toContain("trimmed.match(/^(1)\\s+(.+)$/)");

    await request(app)
      .post(`/inspector/accounts/${bot.account_id}/knowledge/${source.rows[0].id}`)
      .type("form")
      .send({
        name: "Knowledge Founder Editado",
        description: "Descripción editada.",
        summary: "Resumen editado.",
        status: "active",
        summary_status: "ready",
      })
      .expect(302)
      .expect("Location", `/inspector/accounts/${bot.account_id}/knowledge/${source.rows[0].id}`);

    const edited = await pool.query("SELECT * FROM knowledge_sources WHERE id = $1", [source.rows[0].id]);
    expect(edited.rows[0]).toMatchObject({
      name: "Knowledge Founder Editado",
      description: "Descripción editada.",
      summary: "Resumen editado.",
      status: "active",
      summary_status: "ready",
    });

    const definition = {
      ...bot.definition_json,
      knowledge_source_ids: [],
    };
    await pool.query("UPDATE bots SET definition_json = $2::jsonb, knowledge_base_ids_json = '[]'::jsonb WHERE id = $1", [
      bot.id,
      JSON.stringify(definition),
    ]);

    await request(app)
      .post(`/inspector/bots/${bot.id}`)
      .type("form")
      .send({
        name: bot.name,
        description: bot.description,
        goal: bot.definition_json.identity.goal,
        status: bot.status,
        bot_type: bot.bot_type,
        behavior_language: "es-MX",
        behavior_tone: "commercial",
        instrucciones_operativas: bot.instrucciones_operativas,
        constraints_text: bot.definition_json.behavior.constraints,
        knowledge_source_ids: [source.rows[0].id],
      })
      .expect(302);

    const updated = await pool.query("SELECT definition_json FROM bots WHERE id = $1", [bot.id]);
    expect(updated.rows[0].definition_json.knowledge_source_ids).toContain(source.rows[0].id);
  });

  it("frames the bot header by type/scope: system bot is platform-level in admin view, account-scoped on its account URL", async () => {
    const app = create_inspector_test_app(pool);
    const system_bot = (await pool.query("SELECT * FROM bots WHERE slug = 'bot-whatsapp-yoayudo' LIMIT 1")).rows[0];
    const custom_bot = (await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")).rows[0];

    // Vista admin de un bot de sistema: chip "Sistema", framing de plataforma,
    // sin business/account, breadcrumb desde Inspector (no del dashboard de cuenta).
    const admin_system = await request(app).get(`/inspector/bots/${system_bot.id}`).expect(200);
    expect(admin_system.text).toContain("Plataforma YoAyudo");
    expect(admin_system.text).toContain("bot-type-chip is-system");
    expect(admin_system.text).toContain("Sistema");
    expect(admin_system.text).not.toContain("YoAyudo Demo / YoAyudo Ventas");
    expect(admin_system.text).toContain("Ver en cuenta (prueba)");
    // El nombre es editable desde el header (input inline).
    expect(admin_system.text).toContain('id="bot_title_input"');

    // Vista nivel-cuenta del mismo system bot: sí muestra business/account.
    const account_system = await request(app).get(`/inspector/bots/${system_bot.id}/business/account`).expect(200);
    expect(account_system.text).toContain("YoAyudo Demo / YoAyudo Ventas");
    expect(account_system.text).toContain("Ver a nivel plataforma");

    // Un bot custom siempre muestra su business/account (pertenece a una cuenta).
    const admin_custom = await request(app).get(`/inspector/bots/${custom_bot.id}`).expect(200);
    expect(admin_custom.text).toContain("bot-type-chip is-custom");
    expect(admin_custom.text).toContain("YoAyudo Demo / YoAyudo Ventas");
    expect(admin_custom.text).not.toContain("Ver en cuenta (prueba)");
  });

  it("system bots declare expected knowledge AND can assign official-account knowledge for testing", async () => {
    const app = create_inspector_test_app(pool);
    const bot = (await pool.query("SELECT * FROM bots WHERE slug = 'bot-whatsapp-yoayudo' LIMIT 1")).rows[0];
    expect(bot.bot_type).toBe("system");

    // El tab Knowledge de un bot de sistema muestra la nota de knowledge esperado
    // Y también el picker de fuentes de la cuenta oficial (solo para probar).
    const page = await request(app).get(`/inspector/bots/${bot.id}`).expect(200);
    expect(page.text).toContain("Knowledge esperado");
    expect(page.text).toContain('name="expected_knowledge"');
    expect(page.text).toContain("Knowledge para probar");
    expect(page.text).toContain('id="open_knowledge_picker"');
    expect(page.text).toContain("data-knowledge-picker-popup");
    expect(page.text).toContain("Ir a Knowledge Center");

    // Fuente de la cuenta oficial (donde vive el system bot) disponible para probar.
    const source = (
      await pool.query(
        "SELECT id FROM knowledge_sources WHERE account_id = $1 AND source_family = 'business_knowledge' AND status != 'archived' LIMIT 1",
        [bot.account_id],
      )
    ).rows[0];
    expect(source).toBeTruthy();

    // La nota y la fuente de prueba se persisten juntas.
    await request(app)
      .post(`/inspector/bots/${bot.id}`)
      .type("form")
      .send({
        name: bot.name,
        description: bot.description,
        goal: bot.definition_json.identity.goal,
        status: bot.status,
        bot_type: "system",
        behavior_language: "es-MX",
        behavior_tone: "friendly",
        instrucciones_operativas: bot.instrucciones_operativas,
        constraints_text: Array.isArray(bot.definition_json.behavior.constraints)
          ? bot.definition_json.behavior.constraints.join("\n")
          : bot.definition_json.behavior.constraints,
        expected_knowledge: "Catálogo de productos con precios y políticas de envío.",
        knowledge_source_ids: [source.id],
      })
      .expect(302);

    const updated = await pool.query("SELECT definition_json FROM bots WHERE id = $1", [bot.id]);
    expect(updated.rows[0].definition_json.expected_knowledge).toBe(
      "Catálogo de productos con precios y políticas de envío.",
    );
    expect(updated.rows[0].definition_json.knowledge_source_ids).toContain(source.id);
  });

  it("uploads document knowledge through the S3 uploader contract", async () => {
    const uploaded_files = [];
    const app = create_inspector_test_app(pool, {
      knowledge_document_uploader: async (input) => {
        uploaded_files.push(input.file);
        return {
          provider: "s3",
          bucket: "yoayudo-test-knowledge",
          key: `yoayudo/knowledge/${input.file.originalname}`,
          region: "us-east-1",
          original_filename: input.file.originalname,
          mime_type: input.file.mimetype,
          size_bytes: input.file.size,
        };
      },
    });
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1");
    const bot = bot_result.rows[0];

    await request(app)
      .post(`/inspector/accounts/${bot.account_id}/knowledge`)
      .field("source_type", "document")
      .field("scope", "account")
      .field("name", "Manual de ventas")
      .field("description", "Documento base para ventas.")
      .attach("document_file", Buffer.from("contenido del manual"), "manual-ventas.pdf")
      .expect(302)
      .expect("Location", `/inspector/accounts/${bot.account_id}/knowledge`);

    expect(uploaded_files[0].originalname).toBe("manual-ventas.pdf");

    const source = await pool.query("SELECT * FROM knowledge_sources WHERE name = 'Manual de ventas' LIMIT 1");

    expect(source.rows[0].source_type).toBe("document");
    expect(source.rows[0].summary_status).toBe("pending_ingestion");
    expect(source.rows[0].metadata_json.file).toMatchObject({
      provider: "s3",
      bucket: "yoayudo-test-knowledge",
      key: "yoayudo/knowledge/manual-ventas.pdf",
      original_filename: "manual-ventas.pdf",
    });
  });

  it("runs the bot tester from inspector with mocked WhatsApp and human consultation interactions", async () => {
    const app = create_inspector_test_app(pool);
    const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1");
    const bot = bot_result.rows[0];

    const response = await request(app)
      .post(`/inspector/bots/${bot.id}/test-message`)
      .send({
        organization_id: bot.organization_id,
        account_id: bot.account_id,
        mensaje: "Consulta a humano si podemos prometer llamadas automáticas y crea una tarea de seguimiento.",
      })
      .expect(200);

    expect(response.body.result.respuesta).toContain("Recibí el mensaje");
    const interaction_trace = response.body.result.interaction_trace;
    // The router fires MORE THAN ONE interaction: receive + the executed action(s)
    // (e.g. crear_tarea) + consult_human + send all appear in the same trace.
    expect(interaction_trace.map((event) => event.interaction_type)).toEqual(
      expect.arrayContaining(["receive_whatsapp_message", "crear_tarea", "consult_human", "send_whatsapp_message"]),
    );
    expect(interaction_trace.find((event) => event.interaction_type === "consult_human").status).toBe(
      "mock_requested_and_answered",
    );
    const tarea_interaction = interaction_trace.find((event) => event.interaction_type === "crear_tarea");
    expect(tarea_interaction.label).toBe("Crear tarea");
    expect(tarea_interaction.action_id).toBe("crear_tarea");
    expect(interaction_trace.filter((event) => event.status !== "ignored").length).toBeGreaterThan(1);
    expect(response.body.result.action_requests.map((action) => action.action_id)).toContain("crear_tarea");
  });

  it("shows review items for incomplete messages", async () => {
    await simulate(pool, client, "compré 12 kg pastor con Juan");
    const message_result = await pool.query("SELECT * FROM messages WHERE direction = 'inbound' LIMIT 1");
    const trace = await build_message_trace(pool, { message_id: message_result.rows[0].id });

    expect(trace.review_items[0].status).toBe("pending");
    expect(trace.compact_trace_summary.review_status).toBe("pending");
    expect(trace.processing_events.some((event) => event.event_stage === "review")).toBe(true);
  });
});
