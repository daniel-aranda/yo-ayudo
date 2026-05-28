import { human_handoff_agent } from "./subagents/human_handoff_agent.js";
import { inventory_agent } from "./subagents/inventory_agent.js";
import { operations_agent } from "./subagents/operations_agent.js";
import { purchases_agent } from "./subagents/purchases_agent.js";
import { reports_agent } from "./subagents/reports_agent.js";
import { sales_agent } from "./subagents/sales_agent.js";
import { unknown_agent } from "./subagents/unknown_agent.js";

export const default_agent_by_intent = {
  purchase: "purchases_agent",
  sales_update: "sales_agent",
  inventory_update: "inventory_agent",
  day_start: "operations_agent",
  daily_close: "operations_agent",
  daily_note: "operations_agent",
  report_request: "reports_agent",
  human_help: "human_handoff_agent",
  unknown: "unknown_agent",
};

export const system_agent_definitions = {
  operations_agent: {
    id: "operations_agent",
    key: "operations_agent",
    name: "Operations Agent",
    type: "system",
    supported_intents: ["day_start", "daily_close", "daily_note"],
  },
  sales_agent: {
    id: "sales_agent",
    key: "sales_agent",
    name: "Sales Agent",
    type: "system",
    supported_intents: ["sales_update", "sales_inquiry", "price_question", "appointment_request"],
  },
  inventory_agent: {
    id: "inventory_agent",
    key: "inventory_agent",
    name: "Inventory Agent",
    type: "system",
    supported_intents: ["inventory_update"],
  },
  purchases_agent: {
    id: "purchases_agent",
    key: "purchases_agent",
    name: "Purchases Agent",
    type: "system",
    supported_intents: ["purchase"],
  },
  reports_agent: {
    id: "reports_agent",
    key: "reports_agent",
    name: "Reports Agent",
    type: "system",
    supported_intents: ["report_request"],
  },
  human_handoff_agent: {
    id: "human_handoff_agent",
    key: "human_handoff_agent",
    name: "Human Handoff Agent",
    type: "system",
    supported_intents: ["human_help"],
  },
  unknown_agent: {
    id: "unknown_agent",
    key: "unknown_agent",
    name: "Unknown Agent",
    type: "fallback",
    supported_intents: ["unknown"],
  },
};

export const fallback_agent_definition = system_agent_definitions.unknown_agent;
export const human_handoff_agent_definition = system_agent_definitions.human_handoff_agent;

export const agent_handlers = {
  operations_agent,
  sales_agent,
  inventory_agent,
  purchases_agent,
  reports_agent,
  support_agent: operations_agent,
  human_handoff_agent,
  unknown_agent,
};

export function is_executable_agent(agent_key) {
  return Boolean(agent_handlers[agent_key]);
}

export function executable_agent_key_for(agent) {
  const agent_key = agent?.key ?? agent?.agent_key ?? agent?.id;

  if (is_executable_agent(agent_key)) {
    return agent_key;
  }

  const searchable = [
    agent?.id,
    agent?.key,
    agent?.name,
    agent?.type,
    agent?.description,
    agent?.role,
    ...(agent?.responsibilities ?? []),
    ...(agent?.supported_intents ?? []),
    ...(agent?.allowed_intents ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (searchable.includes("handoff") || searchable.includes("humano") || searchable.includes("human")) {
    return "human_handoff_agent";
  }

  if (searchable.includes("venta") || searchable.includes("sales") || searchable.includes("price")) {
    return "sales_agent";
  }

  if (searchable.includes("invent") || searchable.includes("stock")) {
    return "inventory_agent";
  }

  if (searchable.includes("compra") || searchable.includes("purchase")) {
    return "purchases_agent";
  }

  if (searchable.includes("reporte") || searchable.includes("report")) {
    return "reports_agent";
  }

  return "operations_agent";
}

export function system_agent_definition_for(agent_key) {
  return system_agent_definitions[agent_key] ?? fallback_agent_definition;
}

export function handler_for_agent(agent_key) {
  return agent_handlers[agent_key] ?? unknown_agent;
}
