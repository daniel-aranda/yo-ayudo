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
import { json_text, message_alignment } from "../../src/inspector/inspector_presenter.js";
import { compact_trace_summary } from "../../src/inspector/inspector_presenter.js";
import { build_message_trace } from "../../src/inspector/trace_builder.js";
import { get_conversation_view } from "../../src/inspector/inspector_repository.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { format_money } from "../../src/shared/money.js";
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

async function simulate(pool, client, text) {
  return handle_whatsapp_webhook_payload(
    create_simulated_whatsapp_payload({
      from: "5215550000000",
      text,
    }),
    {
      pool,
      provider: new mock_provider(),
      whatsapp_client: client,
      memory_store: new local_memory_store({ base_dir: ".storage/test-inspector-memory" }),
    },
  );
}

function create_inspector_test_app(pool, dependencies = {}) {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.json = json_text;
  app.locals.message_alignment = message_alignment;
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

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

  it("builds a message trace with parsing, router, memory, operation write and outbound response", async () => {
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan");

    const message_result = await pool.query(
      "SELECT * FROM messages WHERE direction = 'inbound' AND parsed_intent = 'purchase' LIMIT 1",
    );
    const trace = await build_message_trace(pool, { message_id: message_result.rows[0].id });

    expect(trace.message.text_body).toContain("pastor");
    expect(trace.parsing_results[0].intent).toBe("purchase");
    expect(trace.router_runs[0].agent_key).toBe("purchases_agent");
    expect(trace.memory_documents[0].status).toBe("stored");
    expect(trace.operational_writes.some((write) => write.type === "purchase")).toBe(true);
    expect(trace.outbound_responses[0].text_body).toContain("Compra registrada");
    expect(trace.processing_events.some((event) => event.event_stage === "routing")).toBe(true);
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
    expect(view.messages).toHaveLength(2);
    expect(view.messages[0].compact_trace_summary.selected_agent).toBe("purchases_agent");
    expect(view.messages[1].message.direction).toBe("outbound");
  });

  it("renders inspector home, conversation and message trace routes", async () => {
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan");
    const ids = await pool.query(`
      SELECT
        bots.id AS bot_id,
        conversations.id AS conversation_id,
        messages.id AS message_id
      FROM bots
      JOIN conversations ON conversations.bot_id = bots.id
      JOIN messages ON messages.conversation_id = conversations.id
      WHERE messages.direction = 'inbound'
      LIMIT 1
    `);
    const app = create_inspector_test_app(pool);

    await request(app).get("/inspector").expect(200).expect(/Inspector de bots y agentes/);
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
    expect(bot_page.text).toContain("Knowledge");
    expect(bot_page.text).toContain("Ir a Knowledge Center");
    expect(bot_page.text).toMatch(/Selecciona knowledge existente|Todo el knowledge disponible ya está asignado/);
    expect(bot_page.text).toContain("Interacciones");
    expect(bot_page.text).toContain("Grupos humanos");
    expect(bot_page.text).toContain("Selecciona grupo humano");
    expect(bot_page.text).toContain("Founder");
    expect(bot_page.text).toContain("Ventas");
    expect(bot_page.text).toContain("Soporte");
    expect(bot_page.text).toContain("Restricciones");
    expect(bot_page.text).toContain("Probar bot");
    expect(bot_page.text).toContain("Mensaje de prueba");
    expect(bot_page.text).toContain("run_bot_test");
    expect(bot_page.text).toContain("Canales soportados");
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
    await request(app)
      .get(`/inspector/conversations/${ids.rows[0].conversation_id}`)
      .expect(200)
      .expect(/purchases_agent/);
    await request(app)
      .get(`/inspector/messages/${ids.rows[0].message_id}`)
      .expect(200)
      .expect(/Operational Writes/)
      .expect(/Compra registrada/);
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
      .post("/inspector/knowledge")
      .type("form")
      .send({
        organization_id: bot.organization_id,
        account_id: bot.account_id,
        source_type: "text",
        scope: "account",
        name: "Knowledge Founder Test",
        description: "Notas para ventas founder.",
        content: "YoAyudo ayuda a negocios a operar ventas por WhatsApp.",
      })
      .expect(302)
      .expect("Location", `/inspector/knowledge?organization_id=${bot.organization_id}&account_id=${bot.account_id}`);

    await request(app)
      .get("/inspector/knowledge")
      .expect(200)
      .expect(/Knowledge Center/)
      .expect(/Agregar knowledge/)
      .expect(/Knowledge existente/)
      .expect(/Knowledge Founder Test/);

    const source = await pool.query("SELECT * FROM knowledge_sources WHERE name = 'Knowledge Founder Test' LIMIT 1");
    const knowledge_page = await request(app).get("/inspector/knowledge").expect(200);
    expect(knowledge_page.text).toContain('id="knowledge_form_panel" hidden');
    expect(knowledge_page.text).toContain('value="text" checked');
    expect(knowledge_page.text).toContain('value="document"');
    expect(knowledge_page.text).toContain('value="url"');
    expect(knowledge_page.text).toContain('type="file"');
    expect(knowledge_page.text).toContain("Máx 10MB");
    expect(knowledge_page.text).toContain("Cancelar");
    expect(knowledge_page.text).toContain("Knowledge");
    expect(knowledge_page.text).toContain("Texto");
    expect(knowledge_page.text).toContain(`/inspector/knowledge/${source.rows[0].id}?organization_id=`);

    const stale_organization_page = await request(app)
      .get(`/inspector/knowledge?organization_id=00000000-0000-0000-0000-000000000001&account_id=${bot.account_id}`)
      .expect(200);

    expect(stale_organization_page.text).toContain("Knowledge Founder Test");
    expect(stale_organization_page.text).toContain(`name="organization_id" value="${bot.organization_id}"`);

    const knowledge_detail_page = await request(app)
      .get(`/inspector/knowledge/${source.rows[0].id}?organization_id=${bot.organization_id}&account_id=${bot.account_id}`)
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
      .post(`/inspector/knowledge/${source.rows[0].id}`)
      .type("form")
      .send({
        organization_id: bot.organization_id,
        account_id: bot.account_id,
        name: "Knowledge Founder Editado",
        description: "Descripción editada.",
        summary: "Resumen editado.",
        status: "active",
        summary_status: "ready",
      })
      .expect(302)
      .expect("Location", `/inspector/knowledge/${source.rows[0].id}?organization_id=${bot.organization_id}&account_id=${bot.account_id}`);

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
      .post("/inspector/knowledge")
      .field("organization_id", bot.organization_id)
      .field("account_id", bot.account_id)
      .field("source_type", "document")
      .field("scope", "account")
      .field("name", "Manual de ventas")
      .field("description", "Documento base para ventas.")
      .attach("document_file", Buffer.from("contenido del manual"), "manual-ventas.pdf")
      .expect(302)
      .expect("Location", `/inspector/knowledge?organization_id=${bot.organization_id}&account_id=${bot.account_id}`);

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
    expect(response.body.result.interaction_trace.map((event) => event.interaction_type)).toEqual(
      expect.arrayContaining(["receive_whatsapp_message", "consult_human", "send_whatsapp_message"]),
    );
    expect(response.body.result.interaction_trace.find((event) => event.interaction_type === "consult_human").status).toBe(
      "mock_requested_and_answered",
    );
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
