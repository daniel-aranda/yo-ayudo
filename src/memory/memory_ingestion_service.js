import { logger } from "../shared/logger.js";
import {
  build_conversation_message_memory_document,
  conversation_memory_service,
} from "./conversation_memory_service.js";
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

export function build_message_memory_document(context, parsed) {
  return build_conversation_message_memory_document(context, parsed);
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
    new conversation_memory_service({
      pool: input.context.pool,
      document_service: new memory_document_service({
        pool: input.context.pool,
        store: input.store,
        embedding: input.embedding,
      }),
    });

  if (input.service) {
    return service.create_document(build_message_memory_document(input.context, input.parsed));
  }

  return service.record_message({
    context: input.context,
    parsed: input.parsed,
  });
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
        conversations.account_id,
        conversations.organization_id,
        conversations.contact_id,
        messages.conversation_id,
        string_agg(messages.text_body, E'\n' ORDER BY messages.created_at) AS summary_text
      FROM conversations
      JOIN messages ON messages.conversation_id = conversations.id
      WHERE conversations.id = $1
        AND messages.direction = 'inbound'
        AND messages.text_body IS NOT NULL
      GROUP BY conversations.account_id, conversations.organization_id, conversations.contact_id, messages.conversation_id
    `,
    [conversation_id],
  );
  const row = result.rows[0];

  if (!row?.summary_text) {
    return null;
  }

  return service.create_document({
    account_id: row.account_id,
    organization_id: row.organization_id,
    contact_id: row.contact_id,
    conversation_id: row.conversation_id,
    document_family: "conversation_memory",
    scope: "conversation",
    document_type: "conversation_summary",
    title: "Resumen de conversación",
    content: row.summary_text,
    source_table: "conversations",
    source_id: row.conversation_id,
    metadata_json: { source: "mock_summary", document_family: "conversation_memory" },
  });
}

export async function summarize_daily_memory({ pool, business_day_id, service }) {
  const result = await pool.query(
    `
      SELECT
        id,
        account_id,
        organization_id,
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
    account_id: row.account_id,
    organization_id: row.organization_id,
    business_day_id: row.id,
    document_family: "conversation_memory",
    scope: "operational_day",
    document_type: "daily_summary",
    title: `Resumen diario ${row.operation_date}`,
    content: `Día ${row.operation_date}: ventas ${row.total_sales ?? 0}, caja final ${row.closing_cash ?? 0}. ${row.free_comment ?? ""}`,
    source_table: "op_business_days",
    source_id: row.id,
    metadata_json: { source: "mock_summary", document_family: "conversation_memory", operation_date: row.operation_date },
  });
}
