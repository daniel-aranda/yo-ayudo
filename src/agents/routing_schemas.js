import { z } from "zod";

const key_schema = z.string().min(1).regex(/^[a-z0-9_]+$/);

export const routing_candidate_schema = z.object({
  agent_id: key_schema,
  agent_key: key_schema,
  agent_name: z.string().min(1),
  agent_type: z.string().min(1),
  executable_agent_key: key_schema,
  source: z.string().min(1),
  score: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  matched_signals: z.array(z.string()).default([]),
  handoff_recommended: z.boolean().default(false),
  handoff_reason: z.string().nullable().default(null),
});

export const routing_decision_schema = z.object({
  selected_agent_id: key_schema,
  selected_agent_name: z.string().min(1),
  selected_agent_type: z.string().min(1),
  agent_key: key_schema,
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
  candidates: z.array(routing_candidate_schema),
  handoff_recommended: z.boolean(),
  handoff_reason: z.string().nullable(),
  used_signals: z.object({
    parsed_intent: z.string().nullable(),
    supported_by_bot: z.boolean(),
    routing_config_matched: z.boolean(),
    agent_definition_matched: z.boolean(),
    legacy_rule_matched: z.boolean(),
    business_knowledge_count: z.number().int().nonnegative(),
    conversation_memory_count: z.number().int().nonnegative(),
    pending_required_fields: z.array(z.string()),
    handoff_rule_matched: z.boolean(),
  }),
});

export function parse_routing_decision(input) {
  return routing_decision_schema.parse(input);
}
