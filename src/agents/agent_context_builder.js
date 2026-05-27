export function context_query_for_intent(input) {
  const intent_text = input.parsed_intent ?? "unknown";
  const text = input.text_body ?? "";

  return `${intent_text} ${text}`.trim();
}

export function retrieval_request_for_message(input) {
  return conversation_memory_request_for_message(input);
}

export function conversation_memory_request_for_message(input) {
  return {
    organization_id: input.organization_id,
    account_id: input.account_id,
    tenant_id: input.tenant_id,
    branch_id: input.branch_id,
    contact_id: input.contact_id,
    conversation_id: input.conversation_id,
    bot_id: input.bot_id,
    solution_template_id: input.solution_template_id,
    query: context_query_for_intent(input),
    document_family: "conversation_memory",
    scopes: ["conversation", "contact", "bot", "account", "operational_day"],
    document_types: [
      "conversation_message",
      "message",
      "conversation_summary",
      "daily_summary",
      "customer_fact",
      "case_state",
      "pending_action",
      "handoff_note",
      "captured_field",
      "customer_objection",
      "router_decision",
      "agent_observation",
    ],
    limit: 3,
  };
}

export function business_knowledge_request_for_message(input) {
  return {
    organization_id: input.organization_id,
    account_id: input.account_id,
    tenant_id: input.tenant_id,
    bot_id: input.bot_id,
    solution_template_id: input.solution_template_id,
    query: context_query_for_intent(input),
    document_family: "business_knowledge",
    scopes: ["organization", "account", "bot", "tenant"],
    document_types: [
      "business_service",
      "business_price",
      "business_policy",
      "business_process",
      "business_faq",
      "business_rule",
      "business_document",
      "business_hours",
      "sales_criteria",
      "owner_instruction",
      "client_knowledge",
    ],
    limit: 3,
  };
}

export function build_agent_context(input, retrieved_context) {
  return {
    current_message: {
      id: input.message_id ?? null,
      text_body: input.text_body ?? "",
      parsed_intent: input.parsed_intent ?? "unknown",
      parsed_json: input.parsed_json ?? {},
    },
    organization: {
      id: input.organization_id ?? null,
    },
    account: {
      id: input.account_id ?? null,
    },
    bot: {
      id: input.bot_id ?? null,
      type: input.bot_type ?? null,
    },
    bot_definition: input.bot_definition ?? {},
    contact: {
      id: input.contact_id ?? null,
    },
    conversation: {
      id: input.conversation_id ?? null,
    },
    conversation_memory: retrieved_context.conversation_memory ?? [],
    business_knowledge: retrieved_context.business_knowledge ?? [],
    operational_state: {},
    channel: input.channel ?? "whatsapp",
  };
}
