import { logger } from "../shared/logger.js";
import { memory_document_service } from "./memory_document_service.js";

const ignored_texts = new Set(["ok", "okay", "gracias", "va", "sale", "listo", "si", "sí"]);
const accepted_intents = new Set([
  "day_start",
  "sales_update",
  "purchase",
  "inventory_update",
  "daily_close",
  "daily_note",
  "report_request",
]);

function normalized_text(text) {
  return (text ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function should_ingest_message_to_memory({ message, parsing_result }) {
  const text = normalized_text(message.text_body);

  if (message.direction !== "inbound") {
    return false;
  }

  if (!text || ignored_texts.has(text)) {
    return false;
  }

  if (text.length < 4 && !accepted_intents.has(parsing_result.intent)) {
    return false;
  }

  if (parsing_result.needs_review && parsing_result.intent === "unknown") {
    return false;
  }

  return accepted_intents.has(parsing_result.intent) || parsing_result.metadata_json?.knowledge_candidate === true;
}

function format_json(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function iso_datetime(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

export function build_message_memory_document(context, parsed) {
  const branch_name = context.branch?.name ?? "sin sucursal";
  const contact_name = context.contact.display_name ?? context.contact.whatsapp_phone;

  return {
    tenant_id: context.tenant.id,
    branch_id: context.branch?.id ?? null,
    contact_id: context.contact.id,
    conversation_id: context.conversation.id,
    message_id: context.message.id,
    bot_id: context.bot?.id ?? context.message.bot_id ?? null,
    solution_template_id: context.bot_profile?.solution_template_id ?? null,
    bot_profile_id: context.bot_profile?.id ?? null,
    scope: "conversation",
    document_type: "message",
    title: `Mensaje ${parsed.intent}`,
    content: [
      `Tenant: ${context.tenant.name}`,
      `Branch: ${branch_name}`,
      `Contact: ${contact_name}`,
      "Channel: whatsapp",
      `Direction: ${context.message.direction}`,
      `Created at: ${iso_datetime(context.message.created_at)}`,
      `Intent: ${parsed.intent}`,
      `Confidence: ${parsed.confidence}`,
      "",
      "Message:",
      context.message.text_body ?? "",
      "",
      "Extracted data:",
      format_json(parsed.data),
    ].join("\n"),
    source_table: "messages",
    source_id: context.message.id,
    source_created_at: context.message.created_at,
    metadata_json: {
      scope: "conversation",
      document_type: "message",
      tenant_id: context.tenant.id,
      branch_id: context.branch?.id ?? null,
      contact_id: context.contact.id,
      conversation_id: context.conversation.id,
      message_id: context.message.id,
      bot_id: context.bot?.id ?? context.message.bot_id ?? null,
      intent: parsed.intent,
      confidence: parsed.confidence,
      source: "whatsapp",
    },
    visibility: "private",
  };
}

export async function ingest_message_to_memory(input) {
  if (
    !should_ingest_message_to_memory({
      message: input.context.message,
      parsing_result: input.parsed,
    })
  ) {
    return null;
  }

  const service =
    input.service ??
    new memory_document_service({
      pool: input.context.pool,
      store: input.store,
      embedding: input.embedding,
    });

  return service.create_document(build_message_memory_document(input.context, input.parsed));
}

export async function safe_ingest_message_to_memory(input) {
  try {
    return await ingest_message_to_memory(input);
  } catch (error) {
    logger.error({ err: error, message_id: input.context.message.id }, "memory ingestion failed");
    return null;
  }
}

export async function summarize_conversation_memory({ pool, conversation_id, service }) {
  const result = await pool.query(
    `
      SELECT
        conversations.tenant_id,
        conversations.branch_id,
        conversations.contact_id,
        messages.conversation_id,
        string_agg(messages.text_body, E'\n' ORDER BY messages.created_at) AS summary_text
      FROM conversations
      JOIN messages ON messages.conversation_id = conversations.id
      WHERE conversations.id = $1
        AND messages.direction = 'inbound'
        AND messages.text_body IS NOT NULL
      GROUP BY conversations.tenant_id, conversations.branch_id, conversations.contact_id, messages.conversation_id
    `,
    [conversation_id],
  );
  const row = result.rows[0];

  if (!row?.summary_text) {
    return null;
  }

  return service.create_document({
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
    contact_id: row.contact_id,
    conversation_id: row.conversation_id,
    scope: "conversation",
    document_type: "conversation_summary",
    title: "Resumen de conversación",
    content: row.summary_text,
    source_table: "conversations",
    source_id: row.conversation_id,
    metadata_json: { source: "mock_summary" },
  });
}

export async function summarize_daily_memory({ pool, business_day_id, service }) {
  const result = await pool.query(
    `
      SELECT
        id,
        tenant_id,
        branch_id,
        operation_date,
        total_sales,
        closing_cash,
        free_comment
      FROM op_business_days
      WHERE id = $1
    `,
    [business_day_id],
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  return service.create_document({
    tenant_id: row.tenant_id,
    branch_id: row.branch_id,
    business_day_id: row.id,
    scope: "operational_day",
    document_type: "daily_summary",
    title: `Resumen diario ${row.operation_date}`,
    content: `Día ${row.operation_date}: ventas ${row.total_sales ?? 0}, caja final ${row.closing_cash ?? 0}. ${row.free_comment ?? ""}`,
    source_table: "op_business_days",
    source_id: row.id,
    metadata_json: { source: "mock_summary", operation_date: row.operation_date },
  });
}
