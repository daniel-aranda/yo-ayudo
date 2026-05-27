export function context_query_for_intent(input) {
  const intent_text = input.parsed_intent ?? "unknown";
  const text = input.text_body ?? "";

  return `${intent_text} ${text}`.trim();
}

export function retrieval_request_for_message(input) {
  return {
    tenant_id: input.tenant_id,
    branch_id: input.branch_id,
    contact_id: input.contact_id,
    conversation_id: input.conversation_id,
    bot_id: input.bot_id,
    solution_template_id: input.solution_template_id,
    query: context_query_for_intent(input),
    scopes: ["global", "solution_template", "tenant", "conversation", "operational_day"],
    document_types: [
      "global_knowledge",
      "solution_knowledge",
      "client_knowledge",
      "conversation_summary",
      "daily_summary",
      "message",
    ],
    limit: 3,
  };
}
