import { describe, expect, it } from "vitest";
import { custom_bot_service } from "../../src/bots/custom_bot_service.js";
import { create_test_pool } from "../helpers/test_pool.js";

function valid_definition(name = "Bot Custom Test") {
  return {
    name,
    description: "Bot custom para ventas y seguimiento.",
    goal: "Atender prospectos, capturar datos y escalar a humano cuando aplique.",
    supported_intents: ["sales_inquiry", "human_help"],
    required_fields: [
      {
        key: "customer_name",
        label: "Nombre",
        description: "Nombre del cliente.",
        required: true,
      },
    ],
    agent_definitions: [
      {
        key: "sales_agent",
        name: "Agente de ventas",
        role: "Responde dudas comerciales y captura datos.",
        allowed_intents: ["sales_inquiry"],
        tools: [],
      },
    ],
    routing_config: {
      default_agent_key: "sales_agent",
      intent_routes: [{ intent: "sales_inquiry", agent_key: "sales_agent", priority: 10 }],
    },
    handoff_policy: {
      enabled: true,
      triggers: ["El cliente pide hablar con humano."],
      message: "Te canalizo con una persona.",
    },
    knowledge_requirements: [
      {
        key: "services",
        description: "Servicios y precios del negocio.",
        required: true,
      },
    ],
    response_style: {
      tone: "claro y amable",
      language: "es-MX",
      max_length: 500,
      formatting: "mensajes cortos",
    },
    constraints: ["No inventar precios."],
  };
}

describe("custom_bot_service", () => {
  it("creates a custom bot with validated definition_json", async () => {
    const pool = await create_test_pool();
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const service = new custom_bot_service({ pool });

    const bot = await service.create_custom_bot({
      account_id: account.rows[0].id,
      name: "Bot Custom Test",
      slug: "bot-custom-test",
      status: "active",
      definition_json: valid_definition(),
    });

    expect(bot.bot_type).toBe("custom");
    expect(bot.status).toBe("active");
    expect(bot.definition_version).toBe(1);
    expect(bot.definition_json.goal).toContain("Atender prospectos");
    expect(bot.definition_json.supported_intents).toContain("sales_inquiry");

    await pool.end();
  });

  it("rejects invalid custom bot definitions", async () => {
    const pool = await create_test_pool();
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const service = new custom_bot_service({ pool });

    await expect(
      service.create_custom_bot({
        account_id: account.rows[0].id,
        name: "Bot Invalido",
        slug: "bot-invalido",
        definition_json: {
          name: "Bot Invalido",
          supported_intents: [],
        },
      }),
    ).rejects.toThrow();

    await pool.end();
  });

  it("lists system and custom bots by account", async () => {
    const pool = await create_test_pool();
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const service = new custom_bot_service({ pool });
    const bots = await service.list_bots_by_account(account.rows[0].id);

    expect(bots.some((bot) => bot.bot_type === "system" && bot.name === "Margen Sabroso Bot")).toBe(true);
    expect(bots.some((bot) => bot.bot_type === "custom" && bot.name === "Bot Ventas Clínica Dental")).toBe(true);

    await pool.end();
  });
});
