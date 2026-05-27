import { describe, expect, it } from "vitest";
import { build_agent_context } from "../../src/agents/agent_context_builder.js";

describe("agent_context_builder", () => {
  it("keeps business knowledge and conversation memory in separate context blocks", () => {
    const context = build_agent_context(
      {
        organization_id: "11111111-1111-4111-8111-111111111111",
        account_id: "22222222-2222-4222-8222-222222222222",
        bot_id: "33333333-3333-4333-8333-333333333333",
        bot_type: "custom",
        bot_definition: { goal: "Atender ventas" },
        contact_id: "44444444-4444-4444-8444-444444444444",
        conversation_id: "55555555-5555-4555-8555-555555555555",
        message_id: "66666666-6666-4666-8666-666666666666",
        text_body: "quiero precio",
        parsed_intent: "price_question",
        parsed_json: { text: "quiero precio" },
        channel: "whatsapp",
      },
      {
        business_knowledge: [{ title: "Precios", document_family: "business_knowledge" }],
        conversation_memory: [{ title: "Pendiente", document_family: "conversation_memory" }],
      },
    );

    expect(context.business_knowledge).toHaveLength(1);
    expect(context.conversation_memory).toHaveLength(1);
    expect(context.bot_definition.goal).toBe("Atender ventas");
    expect(context.current_message.parsed_intent).toBe("price_question");
    expect(context.channel).toBe("whatsapp");
  });
});
