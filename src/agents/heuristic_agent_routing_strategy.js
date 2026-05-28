import {
  default_agent_by_intent,
  executable_agent_key_for,
  fallback_agent_definition,
  human_handoff_agent_definition,
  system_agent_definition_for,
} from "./agent_registry.js";
import { parse_routing_decision } from "./routing_schemas.js";

function normalize_text(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function words(value) {
  return normalize_text(value)
    .split(/[^a-z0-9_]+/)
    .filter((word) => word.length > 2);
}

function clamp_score(value) {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function field_key(field) {
  return typeof field === "string" ? field : field?.key;
}

function present_parsed_keys(parsed_json) {
  const keys = new Set();

  for (const [key, value] of Object.entries(parsed_json ?? {})) {
    if (value !== null && value !== undefined && value !== "") {
      keys.add(key);
    }
  }

  return keys;
}

function pending_required_fields(bot_definition, selected_agent, parsed_json) {
  const present = present_parsed_keys(parsed_json);
  const bot_fields = bot_definition?.required_fields ?? [];
  const agent_fields = selected_agent?.required_fields ?? [];

  return unique(
    [...bot_fields, ...agent_fields]
      .filter((field) => field?.required !== false)
      .map(field_key)
      .filter((key) => key && !present.has(key)),
  );
}

function agent_intents(agent) {
  return unique([...(agent.supported_intents ?? []), ...(agent.allowed_intents ?? [])]);
}

function definition_agents(bot_definition) {
  return (bot_definition?.agent_definitions ?? []).map((agent) => ({
    id: agent.id ?? agent.key,
    key: agent.key ?? agent.id,
    name: agent.name,
    type: agent.type ?? "custom",
    description: agent.description ?? agent.role ?? "",
    role: agent.role ?? "",
    responsibilities: agent.responsibilities ?? [],
    supported_intents: agent.supported_intents ?? agent.allowed_intents ?? [],
    allowed_intents: agent.allowed_intents ?? [],
    required_fields: agent.required_fields ?? [],
    knowledge_scopes: agent.knowledge_scopes ?? [],
    handoff_rules: agent.handoff_rules ?? [],
    response_style: agent.response_style ?? null,
    constraints: agent.constraints ?? [],
    source: "bot_definition",
  }));
}

function route_for_agent(bot_definition, agent_key, parsed_intent) {
  return (bot_definition?.routing_config?.intent_routes ?? []).find(
    (route) => route.intent === parsed_intent && route.agent_key === agent_key,
  );
}

function default_definition_agent(bot_definition, agents) {
  const default_key = bot_definition?.routing_config?.default_agent_key;
  return agents.find((agent) => agent.key === default_key || agent.id === default_key) ?? null;
}

function signal_text_for_agent(agent) {
  return [
    agent.id,
    agent.key,
    agent.name,
    agent.description,
    agent.role,
    ...(agent.responsibilities ?? []),
    ...(agent.handoff_rules ?? []),
    ...(agent.knowledge_scopes ?? []),
    ...(agent.supported_intents ?? []),
    ...(agent.allowed_intents ?? []),
  ].join(" ");
}

function count_keyword_matches(text_body, agent) {
  const text_words = new Set(words(text_body));
  return words(signal_text_for_agent(agent)).filter((word) => text_words.has(word)).length;
}

function handoff_match(agent_context, agents) {
  const policy = agent_context.bot_definition?.handoff_policy ?? {};

  if (policy.enabled === false) {
    return null;
  }

  const parsed_intent = agent_context.current_message.parsed_intent;
  const text_body = agent_context.current_message.text_body ?? "";
  const handoff_agents = agents.filter((agent) => {
    const searchable = normalize_text(`${agent.id} ${agent.key} ${agent.name} ${agent.description} ${agent.role}`);
    return (
      searchable.includes("handoff") ||
      searchable.includes("humano") ||
      searchable.includes("human") ||
      agent_intents(agent).includes("human_help")
    );
  });
  const intent_agent = handoff_agents.find((agent) => agent_intents(agent).includes(parsed_intent));

  if (parsed_intent === "human_help" || intent_agent) {
    return {
      agent: intent_agent ?? handoff_agents[0] ?? human_handoff_agent_definition,
      reason: `intent ${parsed_intent} requires human handoff`,
    };
  }

  const trigger = (policy.triggers ?? []).find((candidate) => {
    const trigger_words = words(candidate);
    const text_words = new Set(words(text_body));
    const meaningful_matches = trigger_words.filter((word) => text_words.has(word));

    return meaningful_matches.length >= Math.min(2, trigger_words.length);
  });

  if (trigger) {
    return {
      agent: handoff_agents[0] ?? human_handoff_agent_definition,
      reason: `handoff policy trigger matched: ${trigger}`,
    };
  }

  return null;
}

function candidate_for_agent(agent, agent_context, options = {}) {
  const parsed_intent = agent_context.current_message.parsed_intent;
  const bot_definition = agent_context.bot_definition ?? {};
  const supported_by_bot = (bot_definition.supported_intents ?? []).includes(parsed_intent);
  const route = route_for_agent(bot_definition, agent.key, parsed_intent);
  const intents = agent_intents(agent);
  const matched_signals = [];
  let score = 0.15;

  if (route) {
    score += 0.5;
    matched_signals.push("routing_config.intent_routes");
  }

  if (intents.includes(parsed_intent)) {
    score += 0.28;
    matched_signals.push("agent.supported_intents");
  }

  if (supported_by_bot) {
    score += 0.05;
    matched_signals.push("bot.supported_intents");
  }

  const keyword_matches = count_keyword_matches(agent_context.current_message.text_body, agent);

  if (keyword_matches > 0) {
    score += Math.min(0.12, keyword_matches * 0.03);
    matched_signals.push("message.agent_keyword_overlap");
  }

  if (agent_context.business_knowledge.length > 0) {
    score += 0.025;
    matched_signals.push("business_knowledge.available");
  }

  if (agent_context.conversation_memory.length > 0) {
    score += 0.025;
    matched_signals.push("conversation_memory.available");
  }

  if (options.legacy_rule_matched) {
    score += 0.35;
    matched_signals.push("agent_routing_rules.legacy");
  }

  if (options.default_match) {
    score += 0.2;
    matched_signals.push("default_agent_by_intent");
  }

  if (options.handoff_reason) {
    score = Math.max(score, 0.92);
    matched_signals.push("handoff_policy");
  }

  if (!matched_signals.length && options.default_definition) {
    score += 0.12;
    matched_signals.push("routing_config.default_agent_key");
  }

  const executable_agent_key = executable_agent_key_for(agent);
  const confidence = clamp_score(score);

  return {
    agent_id: agent.id ?? agent.key,
    agent_key: agent.key ?? agent.id,
    agent_name: agent.name ?? agent.key ?? agent.id,
    agent_type: agent.type ?? "custom",
    executable_agent_key,
    source: agent.source ?? "system",
    score: confidence,
    confidence,
    reason: options.handoff_reason ?? `${matched_signals.join(", ") || "fallback candidate"} scored ${confidence}`,
    matched_signals,
    handoff_recommended: Boolean(options.handoff_reason),
    handoff_reason: options.handoff_reason ?? null,
  };
}

export class heuristic_agent_routing_strategy {
  decide({ agent_context, legacy_routing_rule = null }) {
    const parsed_intent = agent_context.current_message.parsed_intent;
    const bot_definition = agent_context.bot_definition ?? {};
    const custom_agents = definition_agents(bot_definition);
    const candidates = [];
    const handoff = handoff_match(agent_context, custom_agents);

    if (handoff) {
      candidates.push(candidate_for_agent(handoff.agent, agent_context, { handoff_reason: handoff.reason }));
    }

    for (const agent of custom_agents) {
      candidates.push(candidate_for_agent(agent, agent_context));
    }

    const default_agent = default_definition_agent(bot_definition, custom_agents);

    if (default_agent) {
      candidates.push(candidate_for_agent(default_agent, agent_context, { default_definition: true }));
    }

    if (legacy_routing_rule?.agent_key) {
      candidates.push(
        candidate_for_agent(
          {
            ...system_agent_definition_for(legacy_routing_rule.agent_key),
            source: "agent_routing_rules",
          },
          agent_context,
          { legacy_rule_matched: true },
        ),
      );
    }

    const default_agent_key = default_agent_by_intent[parsed_intent] ?? "unknown_agent";
    candidates.push(
      candidate_for_agent(
        {
          ...system_agent_definition_for(default_agent_key),
          source: "default_agent_by_intent",
        },
        agent_context,
        { default_match: true },
      ),
    );

    if (!candidates.length) {
      candidates.push(candidate_for_agent(fallback_agent_definition, agent_context, { default_match: true }));
    }

    const deduped_candidates = [...candidates]
      .sort((left, right) => right.score - left.score)
      .filter((candidate, index, all) => {
        return all.findIndex((other) => other.agent_id === candidate.agent_id && other.source === candidate.source) === index;
      });
    const selected = deduped_candidates[0];
    const pending_fields = pending_required_fields(bot_definition, custom_agents.find((agent) => agent.id === selected.agent_id), agent_context.current_message.parsed_json);
    const decision = {
      selected_agent_id: selected.agent_id,
      selected_agent_name: selected.agent_name,
      selected_agent_type: selected.agent_type,
      agent_key: selected.executable_agent_key,
      confidence: selected.confidence,
      reason: selected.reason,
      candidates: deduped_candidates.slice(0, 6),
      handoff_recommended: selected.handoff_recommended,
      handoff_reason: selected.handoff_reason,
      used_signals: {
        parsed_intent,
        supported_by_bot: (bot_definition.supported_intents ?? []).includes(parsed_intent),
        routing_config_matched: selected.matched_signals.includes("routing_config.intent_routes"),
        agent_definition_matched: selected.source === "bot_definition",
        legacy_rule_matched: Boolean(legacy_routing_rule),
        business_knowledge_count: agent_context.business_knowledge.length,
        conversation_memory_count: agent_context.conversation_memory.length,
        pending_required_fields: pending_fields,
        handoff_rule_matched: selected.matched_signals.includes("handoff_policy"),
      },
    };

    return parse_routing_decision(decision);
  }
}
