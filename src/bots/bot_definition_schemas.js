import { z } from "zod";

export const bot_type_schema = z.enum(["system", "custom"]);
export const bot_status_schema = z.enum(["draft", "active", "archived"]);

const key_schema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9_]+$/, "Use snake_case keys.");

export const required_field_schema = z.object({
  key: key_schema,
  label: z.string().min(1),
  description: z.string().default(""),
  required: z.boolean().default(true),
});

export const agent_definition_schema = z.object({
  key: key_schema,
  name: z.string().min(1),
  role: z.string().min(1),
  allowed_intents: z.array(key_schema).default([]),
  tools: z.array(key_schema).default([]),
});

export const intent_route_schema = z.object({
  intent: key_schema,
  agent_key: key_schema,
  priority: z.number().int().positive().default(100),
});

export const routing_config_schema = z.object({
  default_agent_key: key_schema.default("unknown_agent"),
  intent_routes: z.array(intent_route_schema).default([]),
});

export const handoff_policy_schema = z.object({
  enabled: z.boolean().default(true),
  triggers: z.array(z.string().min(1)).default([]),
  message: z.string().default("Te canalizo con una persona del equipo."),
});

export const knowledge_requirement_schema = z.object({
  key: key_schema,
  description: z.string().min(1),
  required: z.boolean().default(false),
});

export const response_style_schema = z.object({
  tone: z.string().default("claro y profesional"),
  language: z.string().default("es-MX"),
  max_length: z.number().int().positive().max(2000).default(700),
  formatting: z.string().default("mensajes cortos de WhatsApp"),
});

export const custom_bot_definition_schema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  goal: z.string().min(1),
  supported_intents: z.array(key_schema).min(1),
  required_fields: z.array(required_field_schema).default([]),
  agent_definitions: z.array(agent_definition_schema).default([]),
  routing_config: routing_config_schema.default({}),
  handoff_policy: handoff_policy_schema.default({}),
  knowledge_requirements: z.array(knowledge_requirement_schema).default([]),
  response_style: response_style_schema.default({}),
  constraints: z.array(z.string().min(1)).default([]),
});

export function parse_custom_bot_definition(input) {
  return custom_bot_definition_schema.parse(input);
}
