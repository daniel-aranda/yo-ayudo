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

const agent_handlers = {
  operations_agent,
  sales_agent,
  inventory_agent,
  purchases_agent,
  reports_agent,
  support_agent: operations_agent,
  human_handoff_agent,
  unknown_agent,
};

export function handler_for_agent(agent_key) {
  return agent_handlers[agent_key] ?? unknown_agent;
}
