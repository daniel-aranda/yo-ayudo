import { config } from "../app/config.js";
import { date_key_in_timezone } from "../shared/dates.js";
import { logger } from "../shared/logger.js";
import { action_execution_service } from "../actions/action_execution_service.js";
import { create_model_provider } from "../ai/provider_factory.js";
import { observed_model_provider } from "../ai/observed_provider.js";
import { message_intent_parser } from "./message_intent_parser.js";
import { build_reply } from "./response_builder.js";
import { meta_whatsapp_client } from "../channels/whatsapp/whatsapp_client.js";
import { extract_media_metadata, extract_text_body } from "../channels/whatsapp/whatsapp_message_parser.js";
import { resolve_whatsapp_identity_by_phone_number_id } from "../channels/whatsapp/whatsapp_identity_resolver.js";
import { safe_ingest_message_to_memory } from "../memory/memory_ingestion_service.js";
import { record_context_event, safe_record_processing_event } from "../processing_events/processing_event_service.js";

async function upsert_contact(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO contacts (account_id, organization_id, whatsapp_phone, display_name, metadata_json)
      VALUES ($1, $2, $3, $4, '{}'::jsonb)
      ON CONFLICT (account_id, whatsapp_phone)
      DO UPDATE SET
        organization_id = COALESCE(EXCLUDED.organization_id, contacts.organization_id),
        display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
        updated_at = now()
      RETURNING *
    `,
    [input.account_id, input.organization_id, input.whatsapp_phone, input.display_name],
  );

  return result.rows[0];
}

async function upsert_conversation(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO conversations (account_id, organization_id, bot_id, contact_id, channel, status, last_message_at)
      VALUES ($1, $2, $4, $3, 'whatsapp', 'open', now())
      ON CONFLICT (account_id, contact_id, channel)
      DO UPDATE SET
        organization_id = COALESCE(EXCLUDED.organization_id, conversations.organization_id),
        bot_id = COALESCE($4, conversations.bot_id),
        status = 'open',
        last_message_at = now(),
        updated_at = now()
      RETURNING *
    `,
    [input.account_id, input.organization_id, input.contact_id, input.bot_id],
  );

  if (input.bot_id && !result.rows[0].bot_id) {
    await pool.query("UPDATE conversations SET bot_id = $2 WHERE id = $1", [result.rows[0].id, input.bot_id]);
    result.rows[0].bot_id = input.bot_id;
  }

  return result.rows[0];
}

async function find_inbound_message_by_external_id(pool, external_message_id) {
  if (!external_message_id) return null;

  const existing = await pool.query(
    "SELECT * FROM messages WHERE external_message_id = $1 AND direction = 'inbound' LIMIT 1",
    [external_message_id],
  );

  return existing.rows[0] ?? null;
}

async function store_inbound_message(pool, input) {
  const media = extract_media_metadata(input.inbound_message);
  const external_message_id = input.inbound_message.id ?? null;

  // Idempotency: Meta's WhatsApp Cloud API delivers webhooks at-least-once, so a
  // redelivered inbound message must not be stored or processed twice (which would
  // double-count operations, e.g. record a sale twice).
  const duplicate = await find_inbound_message_by_external_id(pool, external_message_id);
  if (duplicate) {
    logger.info({ message_id: duplicate.id, external_message_id }, "duplicate inbound message ignored");
    return { ...duplicate, already_processed: true };
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO messages (
          account_id,
          organization_id,
          bot_id,
          conversation_id,
          contact_id,
          channel,
          direction,
          external_message_id,
          message_type,
          raw_payload_json,
          text_body,
          media_url,
          media_mime_type,
          processing_status
        )
        VALUES ($1, $2, $3, $4, $5, 'whatsapp', 'inbound', $6, $7, $8::jsonb, $9, $10, $11, 'stored')
        RETURNING *
      `,
      [
        input.account_id,
        input.organization_id,
        input.bot_id,
        input.conversation_id,
        input.contact_id,
        external_message_id,
        input.inbound_message.type ?? "unknown",
        JSON.stringify(input.raw_payload),
        extract_text_body(input.inbound_message),
        media.media_url,
        media.media_mime_type,
      ],
    );

    logger.info({ message_id: result.rows[0].id }, "message stored");
    return result.rows[0];
  } catch (error) {
    // Lost the race against a concurrent redelivery: the unique index rejected the
    // second insert. Treat it as an already-processed duplicate instead of crashing.
    if (error?.code === "23505" && external_message_id) {
      const existing = await find_inbound_message_by_external_id(pool, external_message_id);
      if (existing) {
        logger.info({ message_id: existing.id, external_message_id }, "duplicate inbound message ignored (race)");
        return { ...existing, already_processed: true };
      }
    }

    throw error;
  }
}

async function store_parsing_result(pool, input) {
  await pool.query(
    `
      INSERT INTO parsing_results (
        account_id,
        organization_id,
        message_id,
        parser_name,
        intent,
        extracted_json,
        confidence,
        needs_review,
        validation_errors_json
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
    `,
    [
      input.account_id,
      input.organization_id,
      input.message_id,
      input.parsed.parser_name,
      input.parsed.intent,
      JSON.stringify(input.parsed.data),
      input.parsed.confidence.toFixed(4),
      input.parsed.needs_review,
      JSON.stringify(input.parsed.validation_errors),
    ],
  );
}

async function create_review_item(pool, input) {
  await pool.query(
    `
      INSERT INTO review_items (
        account_id,
        organization_id,
        bot_id,
        message_id,
        reason,
        raw_text,
        extracted_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.account_id,
      input.organization_id,
      input.bot_id ?? null,
      input.message_id,
      input.reason,
      input.raw_text,
      JSON.stringify(input.extracted_json),
    ],
  );
  logger.info({ message_id: input.message_id }, "review item created");
}

async function update_message_parsing(pool, message_id, parsed, processing_status) {
  await pool.query(
    `
      UPDATE messages
      SET
        parsed_intent = $2,
        parsed_json = $3::jsonb,
        confidence = $4,
        needs_review = $5,
        processing_status = $6
      WHERE id = $1
    `,
    [
      message_id,
      parsed.intent,
      JSON.stringify(parsed.data),
      parsed.confidence.toFixed(4),
      parsed.needs_review,
      processing_status,
    ],
  );
}

async function store_outbound_message(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO messages (
        account_id,
        organization_id,
        bot_id,
        conversation_id,
        contact_id,
        channel,
        direction,
        external_message_id,
        reply_to_message_id,
        message_type,
        raw_payload_json,
        text_body,
        processing_status
      )
      VALUES ($1, $2, $3, $4, $5, 'whatsapp', 'outbound', $6, $7, 'text', $8::jsonb, $9, 'sent')
      RETURNING *
    `,
    [
      input.account_id,
      input.organization_id,
      input.bot_id ?? null,
      input.conversation_id,
      input.contact_id,
      input.external_message_id ?? null,
      input.reply_to_message_id ?? null,
      JSON.stringify(input.raw_payload),
      input.text_body,
    ],
  );

  return result.rows[0];
}

// Inbound intent -> operational engine action. The deterministic parser extracts
// the data; the matching registrar_* action executes it through the unified
// action flow (audited + guardrailed + visible in the activity view).
const INTENT_TO_OPERATION_ACTION = {
  day_start: "registrar_inicio_dia",
  sales_update: "registrar_venta",
  purchase: "registrar_compra",
  inventory_update: "registrar_inventario",
  daily_close: "registrar_cierre_dia",
  daily_note: "registrar_nota_dia",
  report_request: "generar_reporte_dia",
};

async function route_and_dispatch_operation(dependencies, processing_context, parsed) {
  if (parsed.needs_review) {
    return { routing_result: null, handle_result: { handled: false } };
  }

  if (parsed.intent === "human_help") {
    return {
      routing_result: null,
      handle_result: {
        handled: true,
        reply_text: "Te canalizo con una persona. Mientras tanto, sigo guardando los mensajes operativos.",
      },
    };
  }

  const action_id = INTENT_TO_OPERATION_ACTION[parsed.intent];
  if (!action_id) {
    return {
      routing_result: null,
      handle_result: {
        handled: false,
        reply_text: "No pude clasificar este mensaje para operación. Lo dejo en revisión.",
      },
    };
  }

  const actions = new action_execution_service({ pool: dependencies.pool });
  const result = await actions.execute_action({
    organization_id: processing_context.organization?.id ?? processing_context.bot?.organization_id ?? null,
    account_id: processing_context.account?.id ?? processing_context.bot?.account_id ?? null,
    bot_id: processing_context.bot?.id ?? null,
    conversation_id: processing_context.conversation.id,
    message_id: processing_context.message.id,
    action_id,
    input_json: { ...(parsed.data ?? {}), operation_date: processing_context.operation_date },
    actor_type: "system",
    bypass_bot_enablement: true,
    prompt_fragment: String(processing_context.text ?? "").slice(0, 500),
  });

  return {
    routing_result: null,
    handle_result: {
      handled: result.status === "executed",
      metadata: result.output ?? {},
      report_id: result.output?.report_id,
      action_status: result.status,
    },
  };
}

async function process_inbound_message(dependencies, input) {
  const phone_number_id = input.value.metadata?.phone_number_id ?? config.whatsapp_phone_number_id;
  const resolution = await resolve_whatsapp_identity_by_phone_number_id(dependencies.pool, phone_number_id);
  const contact_profile = input.value.contacts?.find((contact) => contact.wa_id === input.inbound_message.from);
  const account_id = resolution.account?.id ?? null;
  const organization_id = resolution.organization?.id ?? resolution.account?.organization_id ?? null;
  const contact = await upsert_contact(dependencies.pool, {
    account_id,
    organization_id,
    whatsapp_phone: input.inbound_message.from,
    display_name: contact_profile?.profile?.name ?? null,
  });
  const conversation = await upsert_conversation(dependencies.pool, {
    account_id,
    organization_id,
    bot_id: resolution.bot?.id ?? null,
    contact_id: contact.id,
  });
  const stored_message = await store_inbound_message(dependencies.pool, {
    account_id,
    organization_id,
    bot_id: resolution.bot?.id ?? null,
    conversation_id: conversation.id,
    contact_id: contact.id,
    inbound_message: input.inbound_message,
    raw_payload: {
      metadata: input.value.metadata ?? {},
      contact: contact_profile ?? null,
      message: input.inbound_message,
    },
  });

  if (stored_message.already_processed) {
    logger.info({ message_id: stored_message.id }, "inbound message already processed; skipping pipeline");
    return {
      message_id: stored_message.id,
      duplicate: true,
      intent: stored_message.parsed_intent ?? null,
      needs_review: stored_message.needs_review ?? false,
      reply_text: null,
      agent_key: null,
    };
  }

  const event_identity = {
    organization_id: resolution.organization?.id ?? null,
    account_id: resolution.account?.id ?? null,
    bot_id: resolution.bot?.id ?? null,
    conversation_id: conversation.id,
    message_id: stored_message.id,
  };

  await safe_record_processing_event(dependencies.pool, {
    ...event_identity,
    event_type: "webhook_received",
    event_stage: "webhook",
    title: "Webhook received",
    summary: "Inbound WhatsApp webhook message received.",
    details_json: {
      phone_number_id,
      whatsapp_phone_number_id: resolution.whatsapp_phone_number?.id ?? null,
      phone_number_bot_assignment_id: resolution.phone_number_bot_assignment?.id ?? null,
    },
    source_table: "messages",
    source_id: stored_message.id,
  });
  await safe_record_processing_event(dependencies.pool, {
    ...event_identity,
    event_type: "message_saved",
    event_stage: "message_store",
    title: "Message saved",
    summary: "Inbound message and raw payload saved.",
    source_table: "messages",
    source_id: stored_message.id,
  });
  const observed_provider = new observed_model_provider(dependencies.provider, {
    pool: dependencies.pool,
    provider_name: config.ai_provider,
    model: config.ai_provider === "mock" ? "mock-local" : config.bedrock_model_id,
    account_id,
    organization_id,
    message_id: stored_message.id,
  });
  const normalized = await observed_provider.normalize_message({ text: stored_message.text_body ?? "" });
  const operation_date = date_key_in_timezone(
    new Date(),
    resolution.bot_profile?.timezone ?? resolution.account?.timezone ?? "America/Mexico_City",
  );
  const parser = new message_intent_parser(observed_provider);
  const classification = await observed_provider.classify_intent({ text: normalized.normalized_text });
  const parsed = await parser.parse(normalized.normalized_text, classification);
  const processing_context = {
    pool: dependencies.pool,
    bot_profile: resolution.bot_profile,
    solution_template: resolution.solution_template,
    organization: resolution.organization,
    account: resolution.account,
    bot: resolution.bot,
    contact,
    conversation,
    message: stored_message,
    text: normalized.normalized_text,
    operation_date,
  };

  await store_parsing_result(dependencies.pool, {
    account_id,
    organization_id,
    message_id: stored_message.id,
    parsed,
  });
  await record_context_event(dependencies.pool, processing_context, {
    event_type: "parsing_completed",
    event_stage: "parsing",
    title: "Parsing completed",
    summary: `Intent ${parsed.intent} with confidence ${parsed.confidence}.`,
    details_json: {
      intent: parsed.intent,
      confidence: parsed.confidence,
      needs_review: parsed.needs_review,
      validation_errors: parsed.validation_errors,
    },
    source_table: "parsing_results",
    source_id: stored_message.id,
  });

  if (parsed.needs_review) {
    await create_review_item(dependencies.pool, {
      account_id,
      organization_id,
      bot_id: resolution.bot?.id ?? null,
      message_id: stored_message.id,
      reason: parsed.validation_errors[0]?.message?.toString() ?? "low_confidence_or_missing_data",
      raw_text: stored_message.text_body ?? "",
      extracted_json: parsed.data,
    });
    await record_context_event(dependencies.pool, processing_context, {
      event_type: "review_item_created",
      event_stage: "review",
      status: "warning",
      title: "Review item created",
      summary: "Message needs human review.",
      details_json: { intent: parsed.intent, missing_fields: parsed.missing_fields },
      source_table: "review_items",
      source_id: stored_message.id,
    });
  }

  const { routing_result, handle_result } = await route_and_dispatch_operation(
    dependencies,
    processing_context,
    parsed,
  );
  if (routing_result) {
    await record_context_event(dependencies.pool, processing_context, {
      event_type: "router_selected_agent",
      event_stage: "routing",
      title: "Router selected agent",
      summary: `${routing_result.agent_key}: ${routing_result.reason}`,
      details_json: routing_result,
      source_table: "agent_runs",
      source_id: stored_message.id,
    });
  }
  await record_context_event(dependencies.pool, processing_context, {
    event_type: "agent_completed",
    event_stage: "agent",
    title: "Agent completed",
    summary: routing_result?.agent_key ?? "direct dispatcher",
    details_json: {
      handled: handle_result.handled,
      report_id: handle_result.report_id,
      metadata: handle_result.metadata,
    },
    source_table: "messages",
    source_id: stored_message.id,
  });
  await record_context_event(dependencies.pool, processing_context, {
    event_type: "operation_saved",
    event_stage: "operation_write",
    title: "Operation handler completed",
    summary: handle_result.handled ? "Operational write completed or no-op handled." : "No operational write.",
    details_json: handle_result,
    source_table: "messages",
    source_id: stored_message.id,
  });

  if (config.memory_ingestion_enabled) {
    const memory_document = await safe_ingest_message_to_memory({
      context: processing_context,
      parsed,
      handle_result,
      store: dependencies.memory_store,
      embedding: dependencies.embedding_gateway,
    });

    if (memory_document) {
      await record_context_event(dependencies.pool, processing_context, {
        event_type: "memory_document_created",
        event_stage: "memory_ingestion",
        title: "Memory document created",
        summary: `${memory_document.document_type} ${memory_document.status}`,
        details_json: {
          memory_document_id: memory_document.id,
          status: memory_document.status,
          embedding_status: memory_document.embedding_status,
          local_path: memory_document.local_path,
          s3_bucket: memory_document.s3_bucket,
          s3_key: memory_document.s3_key,
        },
        source_table: "memory_documents",
        source_id: memory_document.id,
      });
    }
  }

  const processing_status = parsed.needs_review ? "needs_review" : handle_result.handled ? "handled" : "unhandled";
  await update_message_parsing(dependencies.pool, stored_message.id, parsed, processing_status);
  logger.info(
    { message_id: stored_message.id, intent: parsed.intent, confidence: parsed.confidence },
    "message parsed",
  );
  const reply_text = build_reply(parsed, handle_result);

  if (reply_text) {
    const send_result = await dependencies.whatsapp_client.send_text({
      to: input.inbound_message.from,
      body: reply_text,
    });
    const outbound_message = await store_outbound_message(dependencies.pool, {
      account_id,
      organization_id,
      bot_id: resolution.bot?.id ?? null,
      conversation_id: conversation.id,
      contact_id: contact.id,
      external_message_id: send_result.external_message_id,
      reply_to_message_id: stored_message.id,
      text_body: reply_text,
      raw_payload: {
        request: { to: input.inbound_message.from, body: reply_text },
        response: send_result.raw_response,
      },
    });
    await record_context_event(dependencies.pool, processing_context, {
      event_type: "outbound_message_created",
      event_stage: "outbound_send",
      title: "Outbound response created",
      summary: reply_text,
      details_json: {
        sent: send_result.sent,
        outbound_message_id: outbound_message.id,
      },
      source_table: "messages",
      source_id: outbound_message.id,
    });
    logger.info({ message_id: stored_message.id, sent: send_result.sent }, "outbound message sent");
  }

  return {
    message_id: stored_message.id,
    intent: parsed.intent,
    needs_review: parsed.needs_review,
    reply_text,
    agent_key: routing_result?.agent_key ?? null,
  };
}

export async function handle_whatsapp_webhook_payload(payload, dependencies) {
  logger.info({ object: payload.object }, "inbound webhook received");
  const complete_dependencies = {
    pool: dependencies.pool,
    provider: dependencies.provider ?? create_model_provider(),
    whatsapp_client: dependencies.whatsapp_client ?? new meta_whatsapp_client(),
    memory_store: dependencies.memory_store,
    embedding_gateway: dependencies.embedding_gateway,
  };
  const results = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;

      if (!value?.messages?.length) {
        continue;
      }

      for (const inbound_message of value.messages) {
        results.push(
          await process_inbound_message(complete_dependencies, {
            value,
            inbound_message,
          }),
        );
      }
    }
  }

  return results;
}
