import { z } from "zod";

export const memory_scope_schema = z.enum([
  "global",
  "solution_template",
  "organization",
  "account",
  "bot",
  "contact",
  "conversation",
  "operational_day",
]);

export const memory_document_family_schema = z.enum([
  "business_knowledge",
  "conversation_memory",
  "system_knowledge",
  "legacy",
]);

export const memory_document_type_schema = z.enum([
  "message",
  "conversation_message",
  "conversation_summary",
  "customer_fact",
  "case_state",
  "pending_action",
  "handoff_note",
  "captured_field",
  "customer_objection",
  "daily_summary",
  "client_knowledge",
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
  "solution_knowledge",
  "global_knowledge",
  "operational_fact",
  "router_decision",
  "agent_observation",
]);

const nullable_uuid_schema = z.string().uuid().nullable().optional();

export const memory_document_input_schema = z.object({
  organization_id: nullable_uuid_schema,
  account_id: nullable_uuid_schema,
  contact_id: nullable_uuid_schema,
  conversation_id: nullable_uuid_schema,
  message_id: nullable_uuid_schema,
  bot_id: nullable_uuid_schema,
  business_day_id: nullable_uuid_schema,
  solution_template_id: nullable_uuid_schema,
  bot_profile_id: nullable_uuid_schema,
  document_family: memory_document_family_schema.default("legacy"),
  scope: memory_scope_schema,
  document_type: memory_document_type_schema,
  title: z.string().nullable().optional(),
  content: z.string().min(1),
  source_table: z.string().nullable().optional(),
  source_id: nullable_uuid_schema,
  source_created_at: z.union([z.string(), z.date()]).nullable().optional(),
  metadata_json: z.record(z.unknown()).default({}),
  visibility: z.enum(["private", "internal", "public"]).default("private"),
  version: z.number().int().positive().default(1),
});

export const memory_store_document_schema = z.object({
  document_id: z.string().uuid(),
  content: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

export const retrieve_context_schema = z.object({
  organization_id: z.string().uuid().nullable().optional(),
  account_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  conversation_id: z.string().uuid().nullable().optional(),
  bot_id: z.string().uuid().nullable().optional(),
  solution_template_id: z.string().uuid().nullable().optional(),
  document_family: memory_document_family_schema.nullable().optional(),
  query: z.string().default(""),
  scopes: z.array(memory_scope_schema).default([]),
  document_types: z.array(memory_document_type_schema).default([]),
  limit: z.number().int().positive().max(20).default(5),
});
