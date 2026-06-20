import { get_action } from "../actions/action_registry.js";
import { relative_time_es } from "../shared/dates.js";

export function json_text(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

// Domain intents → human labels. Used as a preview fallback when a message has
// no text (e.g. media), so a conversation still reads as something meaningful.
const CONVERSATION_INTENT_LABELS = {
  day_start: "Caja inicial del día",
  sales_update: "Actualización de ventas",
  purchase: "Compra registrada",
  daily_close: "Cierre del día",
  daily_note: "Nota del día",
  report_request: "Reporte solicitado",
  inventory: "Inventario",
  human_help: "Pide ayuda humana",
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
// Teléfono legible. México: 52 [+ "1" móvil legacy] + 10 dígitos nacionales que
// se agrupan área(2) + 4 + 4 (p. ej. "+52 1 55 5000 0222", "+52 55 5577 7777").
// Fallback genérico: separa código de país de los últimos 10 dígitos.
export function format_phone(raw) {
  const digits = String(raw ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length < 10) return `+${digits}`;

  const national = digits.slice(-10);
  let country = digits.slice(0, -10);
  let mobile_prefix = "";
  if (country === "521") {
    country = "52";
    mobile_prefix = "1 ";
  }

  const grouped = `${national.slice(0, 2)} ${national.slice(2, 6)} ${national.slice(6)}`;
  return country ? `+${country} ${mobile_prefix}${grouped}` : grouped;
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
      output_json: log.output_json ?? {},
      metadata_json: log.metadata_json ?? {},
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

const CONFIDENCE_LOW_THRESHOLD = 72;

function action_tone(status) {
  const value = String(status || "");
  if (value === "executed") return "ok";
  if (value.startsWith("pending")) return "pending";
  return "blocked";
}

function object_value(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function task_id_from_action_output(action) {
  const output = object_value(action.output_json);
  return output.tarea_id ?? output.task_id ?? null;
}

function task_matches_action(task, action_id) {
  const metadata = object_value(task.metadata_json);
  if (metadata.action_id) {
    return metadata.action_id === action_id || (action_id === "consult_human" && metadata.action_id === "crear_tarea");
  }

  return ["crear_tarea", "consult_human"].includes(action_id) && metadata.source === "bot_engine_action";
}

function present_action_task(task) {
  return task
    ? {
        id: task.id,
        titulo: task.titulo,
        status: task.status,
        status_label: task.status_label ?? task.status,
      }
    : null;
}

// CRM: a crear_contacto action carries the saved client's id in its output, so
// the turn chip can offer "Ver prospecto" (same pattern as "Ver tarea").
function client_id_from_action_output(action) {
  const output = object_value(action.output_json);
  return output.cliente_id ?? output.client_id ?? null;
}

function find_client_for_action(action, { clients_by_id, used_client_ids }) {
  if (action.action_id !== "crear_contacto") {
    return null;
  }
  const client_id = client_id_from_action_output(action);
  if (client_id) {
    const client = clients_by_id.get(String(client_id));
    if (client && !used_client_ids.has(String(client.id))) {
      return client;
    }
  }
  return null;
}

function present_action_client(client) {
  return client
    ? {
        id: client.id,
        display_name: client.display_name || client.client_key,
        kind: client.kind,
      }
    : null;
}

function index_tasks_by_message(tasks) {
  const by_message = new Map();
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!task.message_id) continue;
    const key = String(task.message_id);
    by_message.set(key, [...(by_message.get(key) ?? []), task]);
  }
  return by_message;
}

function find_task_for_action(action, { tasks_by_id, message_tasks, used_task_ids }) {
  const direct_task_id = task_id_from_action_output(action);
  if (direct_task_id) {
    const task = tasks_by_id.get(String(direct_task_id));
    if (task && !used_task_ids.has(String(task.id))) {
      return task;
    }
  }

  return message_tasks.find(
    (task) => !used_task_ids.has(String(task.id)) && task_matches_action(task, action.action_id),
  );
}

function present_action_label(action, trace, task) {
  if (task && trace?.intent === "human_help" && action.action_id === "crear_tarea") {
    return "Consultar humano";
  }

  return action.label;
}

// A conversation turn (one inbound + its replies, already grouped server-side)
// → a view-model the timeline can render directly: the user message, the action
// label(s) the agent fired (the rest of the interpretation — intent + confidence
// — lives in a click popover), the agent replies, and an overall status tone.
// No backend contract changes.
// Adjuntos de un mensaje entrante → forma mínima para la vista: el id sirve para
// la ruta de descarga (/inspector/media/:id) y `is_image` decide si se muestra
// como miniatura o como enlace de archivo.
function present_attachments(attachments) {
  return (Array.isArray(attachments) ? attachments : []).map((attachment) => ({
    id: attachment.id,
    mime_type: attachment.mime_type || null,
    is_image: typeof attachment.mime_type === "string" && attachment.mime_type.startsWith("image/"),
    filename: attachment.original_filename || null,
    size_bytes: attachment.size_bytes ?? null,
  }));
}

export function present_conversation_turns(turns, options = {}) {
  const tasks = Array.isArray(options.tasks) ? options.tasks : [];
  const tasks_by_id = new Map(tasks.map((task) => [String(task.id), task]));
  const tasks_by_message = index_tasks_by_message(tasks);
  const clients = Array.isArray(options.clients) ? options.clients : [];
  const clients_by_id = new Map(clients.map((client) => [String(client.id), client]));

  return (Array.isArray(turns) ? turns : []).map((turn) => {
    const trace = turn.incoming?.compact_trace_summary ?? null;
    const has_incoming = Boolean(turn.incoming);
    const incoming_message_id = turn.incoming?.message?.id ?? null;
    const message_tasks = incoming_message_id ? (tasks_by_message.get(String(incoming_message_id)) ?? []) : [];
    const used_task_ids = new Set();
    const used_client_ids = new Set();
    const responses = (turn.responses ?? []).map((reply) => ({
      text: reply.message.text_body || "",
      at: reply.message.created_at,
    }));
    const awaiting_response = has_incoming && responses.length === 0;

    const actions = (trace?.interactions ?? []).map((ix) => {
      const task = find_task_for_action(ix, { tasks_by_id, message_tasks, used_task_ids });
      if (task?.id) {
        used_task_ids.add(String(task.id));
      }
      const client = find_client_for_action(ix, { clients_by_id, used_client_ids });
      if (client?.id) {
        used_client_ids.add(String(client.id));
      }
      return {
        label: present_action_label(ix, trace, task),
        action_id: ix.action_id,
        status: ix.status,
        tone: action_tone(ix.status),
        task: present_action_task(task),
        client: present_action_client(client),
      };
    });
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
          intent_human: conversation_intent_label(trace?.intent) ?? trace?.intent ?? null,
          confidence_pct,
          confidence_tone: confidence_pct == null ? null : confidence_pct < CONFIDENCE_LOW_THRESHOLD ? "low" : "ok",
        }
      : null;

    return {
      id: turn.id,
      status_tone,
      awaiting_response,
      user: turn.incoming
        ? {
            text: turn.incoming.message.text_body || "",
            at: turn.incoming.message.created_at,
            attachments: present_attachments(turn.incoming.message.attachments),
          }
        : null,
      understanding,
      responses,
      trace_id: turn.incoming ? turn.incoming.message.id : responses.length ? turn.responses[0].message.id : null,
    };
  });
}

// Conversation-level rollup for the (generic) summary strip + sidebar diagnostics.
// Derived only from the presented turns — NO domain metrics (sales/cash); those
// are capability-driven and live in "Estado del día". The view formats dates and
// shows "No disponible" for nulls.
export function present_conversation_overview(turns) {
  const list = Array.isArray(turns) ? turns : [];
  let last_action = null;
  let last_intent = null;
  let last_at = null;
  let errors_count = 0;
  let success_count = 0;

  for (const turn of list) {
    if (turn.status_tone === "error") {
      errors_count += 1;
    } else if (turn.understanding?.has_action) {
      success_count += 1;
    }
    if (turn.understanding?.actions?.length) {
      last_action = turn.understanding.actions[0].label;
    }
    if (turn.understanding?.intent_human) {
      last_intent = turn.understanding.intent_human;
    }
    for (const at of [turn.user?.at, ...(turn.responses ?? []).map((reply) => reply.at)]) {
      if (at && (!last_at || new Date(at).getTime() > new Date(last_at).getTime())) {
        last_at = at;
      }
    }
  }

  return {
    turns_count: list.length,
    success_count,
    errors_count,
    last_action,
    last_intent,
    last_at,
  };
}
