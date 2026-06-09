import { get_action } from "../actions/action_registry.js";

export function json_text(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

// Each executed action is one interaction the bot's router decided to trigger.
// Surfacing them per message (with their status) is how we make the
// multi-interaction routing — the bot's edge — visible in the inspector.
export function interactions_from_action_logs(action_logs) {
  return (Array.isArray(action_logs) ? action_logs : []).map((log) => {
    const action = get_action(log.action_id);
    return {
      action_id: log.action_id,
      label: action?.nombre ?? log.action_id,
      status: log.status,
    };
  });
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
  const interactions = interactions_from_action_logs(input.action_logs);

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
    interactions,
    interaction_count: interactions.length,
  };
}

export function message_alignment(direction) {
  return direction === "outbound" ? "message-bubble-outbound" : "message-bubble-inbound";
}
