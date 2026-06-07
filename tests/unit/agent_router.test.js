import { describe, expect, it } from "vitest";
import { agent_router } from "../../src/agents/agent_router.js";
import { create_test_pool } from "../helpers/test_pool.js";

const dental_bot_definition = {
  name: "Bot Comercial Dental",
  description: "Califica ventas, documentos y escalamiento humano.",
  goal: "Atender prospectos y canalizar casos que requieren humano.",
  supported_intents: ["sales_inquiry", "document_request", "financing_question", "human_help"],
  required_fields: [{ key: "customer_name", label: "Nombre", required: true }],
  agent_definitions: [
    {
      id: "ventas",
      name: "Ventas",
      description: "Atiende ventas, precios y citas.",
      responsibilities: ["ventas", "precios", "citas"],
      supported_intents: ["sales_inquiry"],
      required_fields: [{ key: "customer_name", label: "Nombre", required: true }],
    },
    {
      id: "documentos",
      name: "Documentos",
      description: "Atiende solicitudes de documentos, expedientes y comprobantes.",
      responsibilities: ["documentos", "expedientes", "comprobantes"],
      supported_intents: ["document_request"],
    },
  ],
  routing_config: {
    default_agent_key: "ventas",
    intent_routes: [
      { intent: "sales_inquiry", agent_key: "ventas", priority: 10 },
      { intent: "document_request", agent_key: "documentos", priority: 10 },
    ],
  },
  handoff_policy: {
    enabled: true,
    triggers: ["financiamiento", "hablar con humano"],
    message: "Te canalizo con una persona.",
  },
  knowledge_requirements: [],
  response_style: { tone: "claro", language: "es-MX", max_length: 500, formatting: "WhatsApp" },
  constraints: [],
};

class fake_business_knowledge_service {
  async retrieve_relevant_knowledge() {
    return {
      documents: [
        {
          id: "business-doc-1",
          document_family: "business_knowledge",
          scope: "account",
          document_type: "business_faq",
          title: "Servicios",
          content: "Servicio de limpieza dental.",
          metadata: { source: "test" },
          score: 8,
        },
      ],
    };
  }
}

class fake_conversation_memory_service {
  async retrieve_relevant_memory() {
    return {
      documents: [
        {
          id: "memory-doc-1",
          document_family: "conversation_memory",
          scope: "conversation",
          document_type: "pending_action",
          title: "Pendiente",
          content: "Falta nombre del paciente.",
          metadata: { source: "test" },
          score: 7,
        },
      ],
    };
  }
}

async function route_intent(pool, intent) {
  await pool.query(`
    UPDATE contacts
    SET account_id = accounts.id, organization_id = accounts.organization_id
    FROM accounts
    WHERE accounts.slug = 'yoayudo-ventas' AND contacts.account_id IS NULL
  `);
  const context = await pool.query(`
    SELECT
      organizations.id AS organization_id,
      accounts.id AS account_id,
      contacts.id AS contact_id,
      conversations.id AS conversation_id,
      bot_profiles.id AS bot_profile_id,
      bot_profiles.solution_template_id AS solution_template_id
    FROM organizations
    JOIN accounts ON accounts.organization_id = organizations.id
    JOIN bots ON bots.account_id = accounts.id
    JOIN bot_profiles ON bot_profiles.id = bots.bot_profile_id
    JOIN contacts ON contacts.account_id = accounts.id
    LEFT JOIN conversations ON conversations.contact_id = contacts.id
    LIMIT 1
  `);
  const row = context.rows[0];
  const router = new agent_router({ pool });

  return router.route_message({
    organization_id: row.organization_id,
    account_id: row.account_id,
    contact_id: row.contact_id,
    conversation_id: row.conversation_id,
    bot_profile_id: row.bot_profile_id,
    solution_template_id: row.solution_template_id,
    message_id: null,
    parsed_intent: intent,
    parsed_json: {},
    text_body: intent,
  });
}

async function custom_route(pool, overrides = {}) {
  await pool.query(`
    UPDATE contacts
    SET account_id = accounts.id, organization_id = accounts.organization_id
    FROM accounts
    WHERE accounts.slug = 'yoayudo-ventas' AND contacts.account_id IS NULL
  `);
  const context = await pool.query(`
    SELECT
      organizations.id AS organization_id,
      accounts.id AS account_id,
      contacts.id AS contact_id,
      conversations.id AS conversation_id,
      bots.id AS bot_id,
      bots.bot_type
    FROM organizations
    JOIN accounts ON accounts.organization_id = organizations.id
    JOIN contacts ON contacts.account_id = accounts.id
    LEFT JOIN conversations ON conversations.contact_id = contacts.id
    JOIN bots ON bots.account_id = accounts.id
    WHERE bots.bot_type = 'custom'
    LIMIT 1
  `);
  const row = context.rows[0];
  const router = new agent_router({
    pool,
    business_knowledge_service: new fake_business_knowledge_service(),
    conversation_memory_service: new fake_conversation_memory_service(),
  });

  return router.route_message({
    organization_id: row.organization_id,
    account_id: row.account_id,
    contact_id: row.contact_id,
    conversation_id: row.conversation_id,
    bot_id: row.bot_id,
    bot_type: row.bot_type,
    bot_definition: dental_bot_definition,
    channel: "whatsapp",
    message_id: null,
    parsed_intent: overrides.parsed_intent ?? "sales_inquiry",
    parsed_json: overrides.parsed_json ?? {},
    text_body: overrides.text_body ?? "quiero saber precios de limpieza dental",
  });
}

describe("agent_router", () => {
  it("routes known intents to default operational agents", async () => {
    const pool = await create_test_pool();

    await expect(route_intent(pool, "purchase")).resolves.toMatchObject({ agent_key: "purchases_agent" });
    await expect(route_intent(pool, "sales_update")).resolves.toMatchObject({ agent_key: "sales_agent" });
    await expect(route_intent(pool, "inventory_update")).resolves.toMatchObject({ agent_key: "inventory_agent" });
    await expect(route_intent(pool, "report_request")).resolves.toMatchObject({ agent_key: "reports_agent" });
    await expect(route_intent(pool, "unknown")).resolves.toMatchObject({ agent_key: "unknown_agent" });

    await pool.end();
  });

  it("routes a custom bot sales message to the sales subagent from definition_json", async () => {
    const pool = await create_test_pool();
    const result = await custom_route(pool, {
      parsed_intent: "sales_inquiry",
      text_body: "quiero precio de limpieza dental",
    });

    expect(result.selected_agent_id).toBe("ventas");
    expect(result.selected_agent_name).toBe("Ventas");
    expect(result.selected_agent_type).toBe("custom");
    expect(result.agent_key).toBe("sales_agent");
    expect(result.used_signals.routing_config_matched).toBe(true);
    expect(result.retrieved_context.business_knowledge[0].document_family).toBe("business_knowledge");
    expect(result.retrieved_context.conversation_memory[0].document_family).toBe("conversation_memory");

    await pool.end();
  });

  it("routes a custom bot document request to the documents subagent", async () => {
    const pool = await create_test_pool();
    const result = await custom_route(pool, {
      parsed_intent: "document_request",
      text_body: "necesito mis documentos y comprobantes",
    });

    expect(result.selected_agent_id).toBe("documentos");
    expect(result.selected_agent_name).toBe("Documentos");
    expect(result.candidates.some((candidate) => candidate.agent_id === "documentos")).toBe(true);

    await pool.end();
  });

  it("recommends handoff when the bot handoff policy matches", async () => {
    const pool = await create_test_pool();
    const result = await custom_route(pool, {
      parsed_intent: "financing_question",
      text_body: "quiero financiamiento y hablar con humano",
    });

    expect(result.handoff_recommended).toBe(true);
    expect(result.handoff_reason).toContain("handoff");
    expect(result.selected_agent_id).toBe("human_handoff_agent");
    expect(result.agent_key).toBe("human_handoff_agent");

    await pool.end();
  });

  it("stores routing decision trace in agent_runs", async () => {
    const pool = await create_test_pool();

    await custom_route(pool, {
      parsed_intent: "sales_inquiry",
      text_body: "quiero precio de limpieza dental",
    });

    const agent_runs = await pool.query("SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT 1");
    const run = agent_runs.rows[0];

    expect(run.selected_agent_id).toBe("ventas");
    expect(run.routing_reason).toContain("routing_config");
    expect(Number(run.routing_confidence)).toBeGreaterThan(0.8);
    expect(run.routing_candidates_json.length).toBeGreaterThan(0);
    expect(run.used_context_summary_json.business_knowledge_count).toBe(1);
    expect(run.used_context_summary_json.conversation_memory_count).toBe(1);

    await pool.end();
  });
});
