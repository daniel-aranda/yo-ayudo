import { business_knowledge_service as default_business_knowledge_service } from "../knowledge/business_knowledge_service.js";
import { conversation_memory_service as default_conversation_memory_service } from "../memory/conversation_memory_service.js";
import { create_agent_run } from "./agent_run_repository.js";
import {
  build_agent_context,
  business_knowledge_request_for_message,
  conversation_memory_request_for_message,
} from "./agent_context_builder.js";
import { heuristic_agent_routing_strategy } from "./heuristic_agent_routing_strategy.js";

async function find_routing_rule(pool, input) {
  const result = await pool.query(
    `
      SELECT
        agent_routing_rules.*,
        agent_profiles.key AS agent_key
      FROM agent_routing_rules
      JOIN agent_profiles ON agent_profiles.id = agent_routing_rules.agent_profile_id
      WHERE agent_routing_rules.enabled = true
        AND (agent_routing_rules.intent_key = $1 OR agent_routing_rules.intent_key IS NULL)
        AND (agent_routing_rules.solution_template_id = $2 OR agent_routing_rules.solution_template_id IS NULL)
        AND (agent_routing_rules.bot_profile_id = $3 OR agent_routing_rules.bot_profile_id IS NULL)
        AND agent_profiles.status = 'active'
      ORDER BY
        CASE WHEN agent_routing_rules.intent_key = $1 THEN 0 ELSE 1 END,
        agent_routing_rules.priority ASC
      LIMIT 1
    `,
    [
      input.parsed_intent,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
    ],
  );

  return result.rows[0] ?? null;
}

export class agent_router {
  constructor({
    pool,
    business_knowledge_service = new default_business_knowledge_service({ pool }),
    conversation_memory_service = new default_conversation_memory_service({ pool }),
    routing_strategy = new heuristic_agent_routing_strategy(),
  }) {
    this.pool = pool;
    this.business_knowledge_service = business_knowledge_service;
    this.conversation_memory_service = conversation_memory_service;
    this.routing_strategy = routing_strategy;
  }

  async route_message(input) {
    const [business_knowledge, conversation_memory] = await Promise.all([
      this.business_knowledge_service.retrieve_relevant_knowledge(
        business_knowledge_request_for_message(input),
      ),
      this.conversation_memory_service.retrieve_relevant_memory(
        conversation_memory_request_for_message(input),
      ),
    ]);
    const retrieved_context = {
      business_knowledge: business_knowledge.documents,
      conversation_memory: conversation_memory.documents,
    };
    const agent_context = build_agent_context(input, retrieved_context);
    const routing_rule = await find_routing_rule(this.pool, input);
    const decision = this.routing_strategy.decide({
      agent_context,
      legacy_routing_rule: routing_rule,
    });
    const used_context_summary = {
      business_knowledge_count: retrieved_context.business_knowledge.length,
      conversation_memory_count: retrieved_context.conversation_memory.length,
      business_knowledge: retrieved_context.business_knowledge.map((document) => ({
        id: document.id,
        scope: document.scope,
        document_type: document.document_type,
        score: document.score,
      })),
      conversation_memory: retrieved_context.conversation_memory.map((document) => ({
        id: document.id,
        scope: document.scope,
        document_type: document.document_type,
        score: document.score,
      })),
    };
    const stored_agent_context = {
      ...agent_context,
      business_knowledge: {
        count: retrieved_context.business_knowledge.length,
      },
      conversation_memory: {
        count: retrieved_context.conversation_memory.length,
      },
    };
    const output = {
      ...decision,
      context_used: used_context_summary,
    };
    const runtime_output = {
      ...output,
      retrieved_context,
      agent_context,
    };

    await create_agent_run(this.pool, {
      account_id: input.account_id,
      organization_id: input.organization_id,
      contact_id: input.contact_id,
      conversation_id: input.conversation_id,
      message_id: input.message_id,
      bot_id: input.bot_id,
      agent_profile_id: routing_rule?.agent_profile_id ?? null,
      agent_key: decision.agent_key,
      run_type: "route",
      input_json: {
        ...input,
        agent_context: stored_agent_context,
      },
      retrieved_context_json: retrieved_context,
      output_json: output,
      selected_agent_id: decision.selected_agent_id,
      selected_agent_name: decision.selected_agent_name,
      selected_agent_type: decision.selected_agent_type,
      routing_reason: decision.reason,
      routing_confidence: decision.confidence,
      routing_candidates_json: decision.candidates,
      used_context_summary_json: used_context_summary,
      handoff_recommended: decision.handoff_recommended,
      handoff_reason: decision.handoff_reason,
      status: "completed",
      completed_at: new Date().toISOString(),
    });

    return runtime_output;
  }
}
