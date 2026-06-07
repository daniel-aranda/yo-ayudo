import { logger } from "../shared/logger.js";
import { create_processing_event } from "./processing_event_repository.js";

export function processing_identity_from_context(context) {
  return {
    organization_id: context.organization?.id ?? context.bot?.organization_id ?? context.message?.organization_id ?? null,
    account_id: context.account?.id ?? context.bot?.account_id ?? context.message?.account_id ?? null,
    bot_id: context.bot?.id ?? context.message?.bot_id ?? null,
    conversation_id: context.conversation?.id ?? context.message?.conversation_id ?? null,
    message_id: context.message?.id ?? null,
  };
}

export async function safe_record_processing_event(pool, input) {
  try {
    return await create_processing_event(pool, input);
  } catch (error) {
    logger.error({ err: error, event_type: input.event_type }, "processing event failed");
    return null;
  }
}

export async function record_context_event(pool, context, input) {
  return safe_record_processing_event(pool, {
    ...processing_identity_from_context(context),
    ...input,
  });
}
