import { memory_document_service } from "./memory_document_service.js";
import { memory_retrieval_service } from "./memory_retrieval_service.js";

const conversation_scopes = new Set(["conversation", "contact", "bot", "account"]);

function format_json(value) {
  return JSON.stringify(value ?? {}, null, 2);
}

function iso_datetime(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(value).toISOString();
}

export function build_conversation_message_memory_document(context, parsed) {
  const contact_name = context.contact.display_name ?? context.contact.whatsapp_phone;

  return {
    organization_id: context.organization?.id ?? context.bot?.organization_id ?? null,
    account_id: context.account?.id ?? context.bot?.account_id ?? null,
    contact_id: context.contact.id,
    conversation_id: context.conversation.id,
    message_id: context.message.id,
    bot_id: context.bot?.id ?? context.message.bot_id ?? null,
    solution_template_id: context.bot_profile?.solution_template_id ?? null,
    bot_profile_id: context.bot_profile?.id ?? null,
    document_family: "conversation_memory",
    scope: "conversation",
    document_type: "conversation_message",
    title: `Mensaje ${parsed.intent}`,
    content: [
      `Organization: ${context.organization?.name ?? "sin organization"}`,
      `Account: ${context.account?.name ?? "sin account"}`,
      `Bot: ${context.bot?.name ?? "sin bot"}`,
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
      document_family: "conversation_memory",
      scope: "conversation",
      document_type: "conversation_message",
      organization_id: context.organization?.id ?? context.bot?.organization_id ?? null,
      account_id: context.account?.id ?? context.bot?.account_id ?? null,
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

export class conversation_memory_service {
  constructor({
    pool,
    document_service = new memory_document_service({ pool }),
    retrieval_service = new memory_retrieval_service({ pool }),
  }) {
    this.pool = pool;
    this.document_service = document_service;
    this.retrieval_service = retrieval_service;
  }

  async record_document(input) {
    if (!conversation_scopes.has(input.scope)) {
      throw new Error(`Invalid conversation memory scope: ${input.scope}`);
    }

    return this.document_service.create_document({
      organization_id: input.organization_id ?? null,
      account_id: input.account_id ?? null,
      contact_id: input.contact_id ?? null,
      conversation_id: input.conversation_id ?? null,
      message_id: input.message_id ?? null,
      bot_id: input.bot_id ?? null,
      document_family: "conversation_memory",
      scope: input.scope,
      document_type: input.document_type,
      title: input.title,
      content: input.content,
      source_table: input.source_table ?? null,
      source_id: input.source_id ?? null,
      source_created_at: input.source_created_at ?? null,
      metadata_json: {
        ...(input.metadata_json ?? {}),
        document_family: "conversation_memory",
      },
      visibility: input.visibility ?? "private",
      version: input.version ?? 1,
    });
  }

  async record_message({ context, parsed }) {
    return this.document_service.create_document(build_conversation_message_memory_document(context, parsed));
  }

  async retrieve_relevant_memory(input) {
    return this.retrieval_service.retrieve_context({
      organization_id: input.organization_id ?? null,
      account_id: input.account_id ?? null,
      contact_id: input.contact_id ?? null,
      conversation_id: input.conversation_id ?? null,
      bot_id: input.bot_id ?? null,
      query: input.query ?? "",
      document_family: "conversation_memory",
      scopes: input.scopes ?? ["conversation", "contact", "bot", "account"],
      document_types:
        input.document_types ?? [
          "conversation_message",
          "message",
          "conversation_summary",
          "customer_fact",
          "case_state",
          "pending_action",
          "handoff_note",
          "captured_field",
          "customer_objection",
          "router_decision",
          "agent_observation",
        ],
      limit: input.limit ?? 5,
    });
  }
}
