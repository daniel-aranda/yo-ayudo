import { get_action } from "../actions/action_registry.js";
import { relative_time_es } from "../shared/dates.js";

export function json_text(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

// Domain intents → human labels. Used as a preview fallback when a message has
// no text (e.g. media), so a conversation still reads as something meaningful.
const CONVERSATION_INTENT_LABELS = {
  day_start: "Inicio del día",
  sales_update: "Actualización de ventas",
  purchase: "Compra registrada",
  daily_close: "Cierre del día",
  daily_note: "Nota del día",
  report_request: "Reporte solicitado",
  inventory: "Inventario",
};

const CONVERSATION_STATUS = {
  open: { label: "Abierta", tone: "ok" },
  active: { label: "Activa", tone: "ok" },
  closed: { label: "Cerrada", tone: "idle" },
  paused: { label: "Pausada", tone: "warn" },
};

export function conversation_intent_label(intent) {
  return CONVERSATION_INTENT_LABELS[intent] ?? null;
}

// E.164-ish phone → readable. Conservative: only guarantees a single leading
// "+"; per-country grouping is unreliable so we don't fake spacing.
export function format_phone(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

function truncate_preview(text, max = 90) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!value) {
    return "";
  }
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// A raw conversation row → a human inbox summary. Title is the contact (display
// name or formatted phone), preview is the latest message (or its intent),
// plus status, handoff flag and relative time. Never surfaces the raw id.
export function present_conversation_summary(conversation) {
  const name = String(conversation.display_name ?? "").trim();
  const phone = format_phone(conversation.whatsapp_phone);
  const title = name || phone || "Conversación de WhatsApp";
  const subtitle = name && phone ? phone : null;
  const preview =
    truncate_preview(conversation.last_message) ||
    conversation_intent_label(conversation.last_intent) ||
    "Sin mensajes todavía";

  const status_key = conversation.status ?? "open";
  const status = CONVERSATION_STATUS[status_key] ?? { label: status_key, tone: "idle" };
  const handoff = conversation.human_handoff_status;
  const needs_human = Boolean(handoff && handoff !== "none" && handoff !== "resolved");

  return {
    id: conversation.id,
    title,
    subtitle,
    preview,
    status_label: status.label,
    status_tone: status.tone,
    needs_human,
    relative_time: relative_time_es(conversation.last_activity ?? conversation.last_message_at),
    messages_count: conversation.messages_count ?? 0,
    pending_review_count: conversation.pending_review_count ?? 0,
  };
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

const MEMORY_LABELS = { stored: "Memoria guardada", failed: "Memoria falló" };
const EMBEDDING_LABELS = { completed: "Embedding completado", failed: "Embedding falló" };
const CONFIDENCE_LOW_THRESHOLD = 72;

function action_tone(status) {
  const value = String(status || "");
  if (value === "executed") return "ok";
  if (value.startsWith("pending")) return "pending";
  return "blocked";
}

// A conversation turn (one inbound + its replies, already grouped server-side)
// → a view-model the timeline can render directly: the user message, what the
// agent understood (action, intent, confidence, memory, embedding), the agent
// replies, and an overall status tone. No backend contract changes.
export function present_conversation_turns(turns) {
  return (Array.isArray(turns) ? turns : []).map((turn) => {
    const trace = turn.incoming?.compact_trace_summary ?? null;
    const has_incoming = Boolean(turn.incoming);
    const responses = (turn.responses ?? []).map((reply) => ({
      text: reply.message.text_body || "",
      at: reply.message.created_at,
    }));
    const awaiting_response = has_incoming && responses.length === 0;

    const actions = (trace?.interactions ?? []).map((ix) => ({
      label: ix.label,
      action_id: ix.action_id,
      status: ix.status,
      tone: action_tone(ix.status),
    }));
    const confidence_pct =
      trace && trace.confidence != null && trace.confidence !== ""
        ? Math.round(Number(trace.confidence) * 100)
        : null;

    let status_tone = "ok";
    if (trace?.has_error) {
      status_tone = "error";
    } else if (has_incoming && awaiting_response) {
      status_tone = "pending";
    } else if (has_incoming && !actions.length) {
      status_tone = "none";
    } else if (confidence_pct != null && confidence_pct < CONFIDENCE_LOW_THRESHOLD) {
      status_tone = "warn";
    }

    const understanding = has_incoming
      ? {
          actions,
          has_action: actions.length > 0,
          intent_raw: trace?.intent ?? null,
          intent_human: conversation_intent_label(trace?.intent) ?? trace?.intent ?? null,
          confidence_pct,
          confidence_tone: confidence_pct == null ? null : confidence_pct < CONFIDENCE_LOW_THRESHOLD ? "low" : "ok",
          memory_label: MEMORY_LABELS[trace?.memory_status] ?? null,
          embedding_label: EMBEDDING_LABELS[trace?.embedding_status] ?? null,
          has_error: Boolean(trace?.has_error),
          needs_review: Boolean(trace?.needs_review || trace?.review_status),
        }
      : null;

    return {
      id: turn.id,
      status_tone,
      awaiting_response,
      user: turn.incoming
        ? { text: turn.incoming.message.text_body || "", at: turn.incoming.message.created_at }
        : null,
      understanding,
      responses,
      trace_id: turn.incoming ? turn.incoming.message.id : responses.length ? turn.responses[0].message.id : null,
    };
  });
}
