import { rmSync as rm_sync } from "node:fs";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { assign_bot_to_whatsapp_phone_number } from "../../src/bots/bot_assignment_repository.js";
import { upsert_bot } from "../../src/bots/bot_repository.js";
import { create_simulated_whatsapp_payload } from "../../src/channels/whatsapp/whatsapp_message_parser.js";
import { handle_whatsapp_webhook_payload } from "../../src/engine/message_processor.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
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

class failing_memory_store {
  async put_document() {
    throw new Error("forced memory failure");
  }
}

async function simulate(pool, client, text, options = {}) {
  return handle_whatsapp_webhook_payload(
    create_simulated_whatsapp_payload({
      from: "5215550000000",
      text,
      phone_number_id: options.phone_number_id,
    }),
    {
      pool,
      provider: new mock_provider(),
      whatsapp_client: client,
      memory_store: options.memory_store ?? new local_memory_store({ base_dir: ".storage/test-memory" }),
    },
  );
}

describe("WhatsApp inbound pipeline", () => {
  let pool;
  let client;

  before_each(async () => {
    rm_sync(".storage/test-memory", { recursive: true, force: true });
    pool = await create_test_pool();
    client = new fake_whatsapp_client();
  });

  after_each(async () => {
    await pool?.end();
    rm_sync(".storage/test-memory", { recursive: true, force: true });
  });

  it("stores raw payload before parsing and creates one business day for repeated starts", async () => {
    await simulate(pool, client, "abrimos con 1500 en caja");
    await simulate(pool, client, "abrimos con 1800 en caja");

    const operations = await pool.query("SELECT * FROM op_business_days");
    const messages = await pool.query("SELECT * FROM messages WHERE direction = 'inbound' ORDER BY created_at");

    expect(operations.rowCount).toBe(1);
    expect(operations.rows[0].opening_cash).toBe(1800);
    expect(messages.rowCount).toBe(2);
    expect(messages.rows[0].raw_payload_json.message.text.body).toBe("abrimos con 1500 en caja");
    expect(messages.rows[0].parsed_intent).toBe("day_start");
    expect(client.sent_messages[0]?.body).toContain("Inicio del día registrado");
  });

  it("records purchases, sales updates, daily close and deterministic report", async () => {
    await simulate(pool, client, "abrimos con 1500 en caja");
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan");
    await simulate(pool, client, "vendimos 3200 hasta ahorita");
    await simulate(
      pool,
      client,
      "cerramos con 8500 ventas, 3000 efectivo, 4000 tarjeta, 1500 transferencia",
    );

    const purchases = await pool.query("SELECT * FROM op_purchases");
    const sales_updates = await pool.query("SELECT * FROM op_sales_updates");
    const operation = await pool.query("SELECT * FROM op_business_days LIMIT 1");
    const reports = await pool.query("SELECT * FROM op_daily_reports");

    expect(purchases.rowCount).toBe(1);
    expect(purchases.rows[0].item_name).toBe("pastor");
    expect(purchases.rows[0].total_cost).toBe(1680);
    expect(sales_updates.rowCount).toBe(1);
    expect(operation.rows[0].status).toBe("closed");
    expect(operation.rows[0].total_sales).toBe(8500);
    expect(operation.rows[0].cash_sales).toBe(3000);
    expect(operation.rows[0].card_sales).toBe(4000);
    expect(operation.rows[0].transfer_sales).toBe(1500);
    expect(reports.rowCount).toBe(1);
    expect(reports.rows[0].summary_text).toContain("Ventas");
  });

  it("routes through agents and writes useful messages to memory", async () => {
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan");

    const purchases = await pool.query("SELECT * FROM op_purchases");
    const memory_documents = await pool.query("SELECT * FROM memory_documents WHERE document_type = 'conversation_message'");
    const agent_runs = await pool.query("SELECT * FROM agent_runs WHERE run_type = 'route'");

    expect(purchases.rowCount).toBe(1);
    expect(memory_documents.rowCount).toBe(1);
    expect(memory_documents.rows[0].local_path).toContain(".storage/test-memory");
    expect(memory_documents.rows[0].embedding_status).toBe("completed");
    expect(agent_runs.rowCount).toBe(1);
    expect(agent_runs.rows[0].agent_key).toBe("purchases_agent");
  });

  it("keeps processing operations when memory store fails", async () => {
    await simulate(pool, client, "compré 12 kg pastor por 1680 con Juan", {
      memory_store: new failing_memory_store(),
    });

    const purchases = await pool.query("SELECT * FROM op_purchases");
    const memory_documents = await pool.query("SELECT * FROM memory_documents WHERE document_type = 'conversation_message'");

    expect(purchases.rowCount).toBe(1);
    expect(memory_documents.rowCount).toBe(1);
    expect(memory_documents.rows[0].status).toBe("failed");
  });

  it("records inventory and daily notes", async () => {
    await simulate(pool, client, "inventario final: pastor 3 kg, tortilla 20 kg");
    await simulate(pool, client, "sobró pastor y faltó tortilla");

    const inventory = await pool.query("SELECT * FROM op_inventory_snapshots ORDER BY item_name");
    const operation = await pool.query("SELECT * FROM op_business_days LIMIT 1");

    expect(inventory.rowCount).toBe(2);
    expect(operation.rows[0].surplus_notes).toContain("pastor");
    expect(operation.rows[0].shortage_notes).toContain("tortilla");
  });

  it("marks needs_review when critical purchase data is missing", async () => {
    const results = await simulate(pool, client, "compré 12 kg pastor con Juan");
    const review_items = await pool.query("SELECT * FROM review_items");
    const messages = await pool.query("SELECT * FROM messages WHERE direction = 'inbound'");

    expect(results[0]?.needs_review).toBe(true);
    expect(review_items.rowCount).toBe(1);
    expect(messages.rows[0].needs_review).toBe(true);
    expect(client.sent_messages[0]?.body).toContain("costo total");
  });

  it("resolves tenant from configured WhatsApp phone number id and logs mock AI calls", async () => {
    await simulate(pool, client, "vendimos 3200 hasta ahorita");

    const messages = await pool.query(`
      SELECT messages.*, tenants.name AS tenant_name
      FROM messages
      JOIN tenants ON tenants.id = messages.tenant_id
      WHERE messages.direction = 'inbound'
      LIMIT 1
    `);
    const ai_calls = await pool.query("SELECT * FROM ai_calls ORDER BY created_at");

    expect(messages.rows[0].tenant_name).toBe("Margen Sabroso");
    expect(ai_calls.rowCount).toBeGreaterThanOrEqual(3);
    expect(ai_calls.rows.some((row) => row.provider === "mock")).toBe(true);
  });

  it("stores conversation and message with the bot actively assigned to the WhatsApp number", async () => {
    const context = await pool.query(`
      SELECT
        organizations.id AS organization_id,
        accounts.id AS account_id,
        tenants.id AS tenant_id,
        bot_profiles.id AS bot_profile_id,
        whatsapp_phone_numbers.id AS whatsapp_phone_number_id,
        whatsapp_phone_numbers.phone_number_id
      FROM organizations
      JOIN accounts ON accounts.organization_id = organizations.id
      JOIN tenants ON tenants.id = accounts.tenant_id
      JOIN bot_profiles ON bot_profiles.tenant_id = tenants.id
      JOIN whatsapp_phone_numbers ON whatsapp_phone_numbers.account_id = accounts.id
      LIMIT 1
    `);
    const row = context.rows[0];
    const assigned_bot = await upsert_bot(pool, {
      organization_id: row.organization_id,
      account_id: row.account_id,
      tenant_id: row.tenant_id,
      bot_profile_id: row.bot_profile_id,
      name: "Assigned Sales Bot",
      slug: "assigned-sales-bot",
      channel: "whatsapp",
      status: "active",
      settings_json: { test: true },
    });
    await assign_bot_to_whatsapp_phone_number(pool, {
      organization_id: row.organization_id,
      account_id: row.account_id,
      whatsapp_phone_number_id: row.whatsapp_phone_number_id,
      bot_id: assigned_bot.id,
      metadata_json: { source: "test" },
    });

    await simulate(pool, client, "vendimos 3200 hasta ahorita", {
      phone_number_id: row.phone_number_id,
    });

    const conversation = await pool.query("SELECT * FROM conversations LIMIT 1");
    const message = await pool.query("SELECT * FROM messages WHERE direction = 'inbound' LIMIT 1");
    const events = await pool.query("SELECT * FROM processing_events WHERE event_type = 'webhook_received' LIMIT 1");

    expect(conversation.rows[0].bot_id).toBe(assigned_bot.id);
    expect(message.rows[0].bot_id).toBe(assigned_bot.id);
    expect(events.rows[0].bot_id).toBe(assigned_bot.id);
    expect(events.rows[0].account_id).toBe(row.account_id);
    expect(events.rows[0].details_json.phone_number_bot_assignment_id).toBeTruthy();
  });
});
