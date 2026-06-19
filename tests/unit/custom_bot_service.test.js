import { describe, expect, it } from "vitest";
import { custom_bot_service } from "../../src/bots/custom_bot_service.js";
import { create_test_pool } from "../helpers/test_pool.js";

function valid_definition(name = "Bot Custom Test") {
  return {
    identity: {
      name,
      description: "Bot custom para ventas y seguimiento.",
      goal: "Atender prospectos, capturar datos y consultar a humano cuando aplique.",
      status: "active",
      type: "custom",
    },
    behavior: {
      language: "es-MX",
      tone: "friendly",
      operating_instructions: "Atiende prospectos, pregunta datos faltantes y usa knowledge cuando aplique.",
      constraints: "No inventar precios.",
    },
    knowledge_source_ids: [],
    interactions: [
      {
        key: "receive_whatsapp_message",
        type: "receive_whatsapp_message",
        label: "Recibir mensajes de WhatsApp",
        enabled: true,
        instructions: "Atiende mensajes comerciales entrantes.",
      },
      {
        key: "send_whatsapp_message",
        type: "send_whatsapp_message",
        label: "Enviar mensaje de WhatsApp",
        enabled: true,
        instructions: "Responde con claridad.",
      },
    ],
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
    expect(bot.definition_json.identity.goal).toContain("Atender prospectos");
    expect(bot.definition_json.interactions.map((interaction) => interaction.type)).toContain("receive_whatsapp_message");

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
          identity: { name: "Bot Invalido" },
          interactions: [],
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

    expect(bots.some((bot) => bot.bot_type === "system" && bot.name === "Bot Operaciones")).toBe(true);
    expect(bots.some((bot) => bot.bot_type === "custom" && bot.name === "Agente WhatsApp YoAyudo")).toBe(true);
    expect(bots.some((bot) => bot.bot_type === "custom" && bot.name === "Agente de Prospectos")).toBe(true);

    await pool.end();
  });

  it("creates a system bot in draft (platform template, editable in the inspector)", async () => {
    const pool = await create_test_pool();
    const account = await pool.query("SELECT * FROM accounts LIMIT 1");
    const service = new custom_bot_service({ pool });

    const bot = await service.create_system_bot({
      account_id: account.rows[0].id,
      name: "Bot Reservas",
      description: "Agenda reservas por WhatsApp.",
    });

    expect(bot.bot_type).toBe("system");
    expect(bot.status).toBe("draft");
    expect(bot.name).toBe("Bot Reservas");
    expect(bot.definition_json.identity.type).toBe("system");
    expect(bot.definition_json.identity.description).toBe("Agenda reservas por WhatsApp.");

    await pool.end();
  });
});
