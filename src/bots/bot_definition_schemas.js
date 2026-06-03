import { z } from "zod";

export const bot_type_schema = z.enum(["system", "custom"]);
export const bot_status_schema = z.enum(["draft", "active", "archived"]);

const interaction_type_schema = z.enum(["send_whatsapp_message", "receive_whatsapp_message", "consult_human"]);

export const bot_identity_schema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  goal: z.string().min(1),
  status: bot_status_schema.default("draft"),
  type: bot_type_schema.default("custom"),
});

export const bot_behavior_schema = z.object({
  language: z.enum(["es-MX", "en-US"]).default("es-MX"),
  tone: z.enum(["direct", "friendly", "professional", "commercial", "technical", "casual"]).default("professional"),
  operating_instructions: z.string().min(1),
  constraints: z.string().default(""),
});

export const bot_interaction_schema = z.object({
  key: interaction_type_schema,
  type: interaction_type_schema,
  label: z.string().min(1),
  enabled: z.boolean().default(true),
  instructions: z.string().default(""),
  human_group_ids: z.array(z.string().min(1)).default([]),
});

export const custom_bot_definition_schema = z.object({
  identity: bot_identity_schema,
  behavior: bot_behavior_schema,
  knowledge_source_ids: z.array(z.string().uuid()).default([]),
  interactions: z.array(bot_interaction_schema).default([]),
});

export function parse_custom_bot_definition(input) {
  return custom_bot_definition_schema.parse(input);
}
