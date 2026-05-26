import { handle_with_operation_dispatcher } from "./operation_agent_helpers.js";

export async function sales_agent(context, parsed) {
  return handle_with_operation_dispatcher(context, parsed);
}
