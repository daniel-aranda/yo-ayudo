import express from "express";
import path from "node:path";
import { rmSync as rm_sync } from "node:fs";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { create_simulated_whatsapp_payload } from "../../src/channels/whatsapp/whatsapp_message_parser.js";
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

function create_inspector_test_app(pool) {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.json = json_text;
  app.locals.message_alignment = message_alignment;

  register_inspector_routes(router, { pool });
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });

  return app;
}

async function seed_minimal_message(pool) {
  const context = await pool.query(`
    SELECT
      tenants.id AS tenant_id,
      branches.id AS branch_id,
      contacts.id AS contact_id,
      bots.id AS bot_id
    FROM tenants
    JOIN branches ON branches.tenant_id = tenants.id
    JOIN contacts ON contacts.tenant_id = tenants.id
    JOIN bots ON bots.tenant_id = tenants.id
    LIMIT 1
  `);
  const row = context.rows[0];
  const conversation = await pool.query(
    `
      INSERT INTO conversations (tenant_id, branch_id, bot_id, contact_id, channel, last_message_at)
      VALUES ($1, $2, $3, $4, 'whatsapp', now())
      RETURNING *
    `,
    [row.tenant_id, row.branch_id, row.bot_id, row.contact_id],
  );
  const message = await pool.query(
    `
      INSERT INTO messages (
        tenant_id,
        branch_id,
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
      row.tenant_id,
      row.branch_id,
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
    await request(app).get(`/inspector/bots/${ids.rows[0].bot_id}`).expect(200).expect(/Agente WhatsApp YoAyudo/);
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

  it("shows review items for incomplete messages", async () => {
    await simulate(pool, client, "compré 12 kg pastor con Juan");
    const message_result = await pool.query("SELECT * FROM messages WHERE direction = 'inbound' LIMIT 1");
    const trace = await build_message_trace(pool, { message_id: message_result.rows[0].id });

    expect(trace.review_items[0].status).toBe("pending");
    expect(trace.compact_trace_summary.review_status).toBe("pending");
    expect(trace.processing_events.some((event) => event.event_stage === "review")).toBe(true);
  });
});
