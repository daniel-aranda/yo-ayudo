import { dispatch_operation } from "../../engine/operation_dispatcher.js";

export async function handle_with_operation_dispatcher(context, parsed) {
  return dispatch_operation(context, parsed);
}
