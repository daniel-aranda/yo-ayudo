import { describe, expect, it } from "vitest";
import { agent_router } from "../../src/agents/agent_router.js";
import { create_test_pool } from "../helpers/test_pool.js";

async function route_intent(pool, intent) {
  const context = await pool.query(`
    SELECT
      tenants.id AS tenant_id,
      branches.id AS branch_id,
      contacts.id AS contact_id,
      conversations.id AS conversation_id,
      bot_profiles.id AS bot_profile_id,
      bot_profiles.solution_template_id AS solution_template_id
    FROM tenants
    JOIN branches ON branches.tenant_id = tenants.id
    JOIN contacts ON contacts.tenant_id = tenants.id
    LEFT JOIN conversations ON conversations.contact_id = contacts.id
    JOIN bot_profiles ON bot_profiles.tenant_id = tenants.id
    WHERE tenants.slug = 'margen-sabroso'
    LIMIT 1
  `);
  const row = context.rows[0];
  const router = new agent_router({ pool });

  return router.route_message({
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
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
});
