export function json_text(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function compact_trace_summary(input) {
  const parsing_result = input.parsing_results?.[0] ?? null;
  const router_run = input.router_runs?.[0] ?? null;
  const memory_document = input.memory_documents?.[0] ?? null;
  const pending_review =
    input.review_items?.find((item) => ["pending", "open"].includes(item.status)) ?? null;
  const failed_agent = input.agent_runs?.find((run) => run.status === "failed") ?? null;
  const failed_memory = input.memory_documents?.find((document) => document.status === "failed") ?? null;
  const error_event = input.processing_events?.find((event) => event.status === "error") ?? null;

  return {
    intent: parsing_result?.intent ?? input.message?.parsed_intent ?? null,
    confidence: parsing_result?.confidence ?? input.message?.confidence ?? null,
    needs_review: Boolean(parsing_result?.needs_review ?? input.message?.needs_review),
    selected_agent: router_run?.agent_key ?? null,
    agent_status: router_run?.status ?? null,
    memory_status: memory_document?.status ?? null,
    embedding_status: memory_document?.embedding_status ?? null,
    has_error: Boolean(failed_agent || failed_memory || error_event),
    review_status: pending_review?.status ?? null,
  };
}

export function message_alignment(direction) {
  return direction === "outbound" ? "message-bubble-outbound" : "message-bubble-inbound";
}
