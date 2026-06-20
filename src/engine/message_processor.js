import { config } from "../app/config.js";
import { date_key_in_timezone } from "../shared/dates.js";
import { logger } from "../shared/logger.js";
import { action_execution_service } from "../actions/action_execution_service.js";
import { create_model_provider } from "../ai/provider_factory.js";
import { observed_model_provider } from "../ai/observed_provider.js";
import { resolve_ai_config } from "../ai/ai_config_resolver.js";
import { get_platform_ai_config } from "../app/platform_settings_repository.js";
import { message_intent_parser } from "./message_intent_parser.js";
import { build_multi_reply } from "./response_builder.js";
import { meta_whatsapp_client } from "../channels/whatsapp/whatsapp_client.js";
import { extract_media_metadata, extract_text_body } from "../channels/whatsapp/whatsapp_message_parser.js";
import { meta_messaging_client } from "../channels/meta_messaging_client.js";
import { parse_meta_messaging_payload } from "../channels/meta_messaging_parser.js";
import { whatsapp_channel, instagram_channel, messenger_channel } from "../channels/channel_registry.js";
import { store_conversation_media } from "../channels/conversation_media_store.js";
import { create_message_attachment } from "../channels/message_attachment_repository.js";
import { safe_ingest_message_to_memory } from "../memory/memory_ingestion_service.js";
import { record_context_event, safe_record_processing_event } from "../processing_events/processing_event_service.js";
import { safe_record_integration_event } from "../integrations/integration_event_repository.js";

async function upsert_contact(pool, input) {
  const channel = input.channel ?? "whatsapp";

  // WhatsApp conserva su dedupe por teléfono (ON CONFLICT, race-safe) intacto; solo
  // se rellenan también channel/external_id (backfill perezoso de filas viejas).
  if (channel === "whatsapp") {
    const result = await pool.query(
      `
        INSERT INTO contacts (account_id, organization_id, channel, external_id, whatsapp_phone, display_name, metadata_json)
        VALUES ($1, $2, 'whatsapp', $3, $3, $4, '{}'::jsonb)
        ON CONFLICT (account_id, whatsapp_phone)
        DO UPDATE SET
          organization_id = COALESCE(EXCLUDED.organization_id, contacts.organization_id),
          display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
          external_id = COALESCE(contacts.external_id, EXCLUDED.external_id),
          updated_at = now()
        RETURNING *
      `,
      [input.account_id, input.organization_id, input.external_id, input.display_name],
    );
    return result.rows[0];
  }

  // IG/Messenger: dedupe en JS por (account_id, channel, external_id) — sin índice
  // único parcial (pg-mem-safe), mismo patrón que crm_clients.
  const existing = await pool.query(
    "SELECT * FROM contacts WHERE account_id = $1 AND channel = $2 AND external_id = $3 LIMIT 1",
    [input.account_id, channel, input.external_id],
  );
  if (existing.rows[0]) {
    const updated = await pool.query(
      `
        UPDATE contacts
        SET organization_id = COALESCE($2, organization_id),
            display_name = COALESCE($3, display_name),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [existing.rows[0].id, input.organization_id, input.display_name],
    );
    return updated.rows[0];
  }
  const inserted = await pool.query(
    `
      INSERT INTO contacts (account_id, organization_id, channel, external_id, display_name, metadata_json)
      VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)
      RETURNING *
    `,
    [input.account_id, input.organization_id, channel, input.external_id, input.display_name],
  );
  return inserted.rows[0];
}

async function upsert_conversation(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO conversations (account_id, organization_id, bot_id, contact_id, channel, status, last_message_at)
      VALUES ($1, $2, $4, $3, $5, 'open', now())
      ON CONFLICT (account_id, contact_id, channel)
      DO UPDATE SET
        organization_id = COALESCE(EXCLUDED.organization_id, conversations.organization_id),
        bot_id = COALESCE($4, conversations.bot_id),
        status = 'open',
        last_message_at = now(),
        updated_at = now()
      RETURNING *
    `,
    [input.account_id, input.organization_id, input.contact_id, input.bot_id, input.channel ?? "whatsapp"],
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
  // El evento ya viene normalizado por canal (texto/media/id extraídos por el
  // handler del webhook), así que el store es agnóstico de canal.
  const event = input.event;
  const external_message_id = event.external_message_id ?? null;

  // Idempotency: los webhooks de Meta (WhatsApp/IG/Messenger) se entregan
  // at-least-once, así que un mensaje reentregado no debe guardarse ni procesarse
  // dos veces (duplicaría operaciones, p. ej. registrar una venta dos veces).
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
        VALUES ($1, $2, $3, $4, $5, $12, 'inbound', $6, $7, $8::jsonb, $9, $10, $11, 'stored')
        RETURNING *
      `,
      [
        input.account_id,
        input.organization_id,
        input.bot_id,
        input.conversation_id,
        input.contact_id,
        external_message_id,
        event.message_type ?? "unknown",
        JSON.stringify(input.raw_payload),
        event.text ?? "",
        event.media?.media_url ?? null,
        event.media?.media_mime_type ?? null,
        input.channel ?? "whatsapp",
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
      VALUES ($1, $2, $3, $4, $5, $10, 'outbound', $6, $7, 'text', $8::jsonb, $9, 'sent')
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
      input.channel ?? "whatsapp",
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
  lead_capture: "crear_contacto",
};

async function dispatch_one_operation(actions, processing_context, parsed) {
  if (parsed.needs_review) {
    return { intent: parsed.intent, parsed, handled: false, needs_review: true };
  }

  if (parsed.intent === "human_help") {
    return {
      intent: parsed.intent,
      parsed,
      handled: true,
      reply_text: "Te canalizo con una persona. Mientras tanto, sigo guardando los mensajes operativos.",
    };
  }

  const action_id = INTENT_TO_OPERATION_ACTION[parsed.intent];
  if (!action_id) {
    return {
      intent: parsed.intent,
      parsed,
      handled: false,
      reply_text: "No pude clasificar este mensaje para operación. Lo dejo en revisión.",
    };
  }

  const result = await actions.execute_action({
    organization_id: processing_context.organization?.id ?? processing_context.bot?.organization_id ?? null,
    account_id: processing_context.account?.id ?? processing_context.bot?.account_id ?? null,
    bot_id: processing_context.bot?.id ?? null,
    conversation_id: processing_context.conversation.id,
    message_id: processing_context.message.id,
    action_id,
    input_json: { ...(parsed.data ?? {}), operation_date: processing_context.operation_date },
    actor_type: "system",
    prompt_fragment: String(processing_context.text ?? "").slice(0, 500),
  });

  return {
    intent: parsed.intent,
    parsed,
    action_id,
    handled: result.status === "executed",
    action_status: result.status,
    metadata: result.output ?? {},
    report_id: result.output?.report_id,
  };
}

// Multi-interaction execution: a single inbound message can resolve to several
// operations, and each one runs through the unified, audited action flow. Every
// execution writes its own action_audit_logs row — which is exactly what surfaces
// the per-message interaction chips in the inspector. This is the bot's edge.
async function route_and_dispatch_operations(dependencies, processing_context, operations) {
  const actions = new action_execution_service({ pool: dependencies.pool });
  const results = [];

  for (const parsed of operations) {
    results.push(await dispatch_one_operation(actions, processing_context, parsed));
  }

  return results;
}

// Descarga el media entrante (si lo hay) y lo guarda en S3/local, registrando un
// `message_attachments`. Es **best-effort**: try/catch + integration_event; nunca
// rompe el inbound ni finge (sin credenciales/proveedor solo registra el intento).
async function store_inbound_attachment(channel, dependencies, { stored_message, organization_id, account_id, identity }) {
  // WhatsApp guarda un media id (requiere lookup); IG/Messenger una URL directa.
  // En ambos `media_url` es la referencia; el canal sabe cómo descargarla.
  const media_ref = stored_message?.media_url;
  if (!media_ref) {
    return;
  }
  try {
    const download = await channel.download_media(dependencies.client, identity, media_ref);
    if (!download?.downloaded) {
      const not_configured = ["missing_whatsapp_credentials", "missing_meta_credentials", "missing_media_url"].includes(
        download?.reason,
      );
      await safe_record_integration_event(dependencies.pool, {
        integration_key: "conversation_media",
        operation: "download",
        status: not_configured ? "not_configured" : "failure",
        detail: download?.reason ?? "unknown",
        organization_id,
        account_id,
        bot_id: stored_message.bot_id ?? null,
      });
      return;
    }

    const stored = await store_conversation_media({
      buffer: download.buffer,
      mime_type: download.mime_type ?? stored_message.media_mime_type,
      original_filename: download.original_filename,
      organization_id,
      account_id,
      channel: channel.name,
      source_media_id: media_ref,
    });

    await create_message_attachment(dependencies.pool, {
      message_id: stored_message.id,
      organization_id,
      account_id,
      channel: channel.name,
      provider: stored.provider,
      bucket: stored.bucket,
      s3_key: stored.s3_key,
      local_path: stored.local_path,
      region: stored.region,
      mime_type: stored.mime_type,
      size_bytes: stored.size_bytes,
      original_filename: stored.original_filename,
      source_media_id: media_ref,
      status: "stored",
    });

    await safe_record_integration_event(dependencies.pool, {
      integration_key: "conversation_media",
      operation: "store",
      status: "success",
      organization_id,
      account_id,
      bot_id: stored_message.bot_id ?? null,
      metadata_json: { provider: stored.provider, mime_type: stored.mime_type },
    });
  } catch (error) {
    logger.error({ err: error, message_id: stored_message.id }, "inbound attachment store failed");
    await safe_record_integration_event(dependencies.pool, {
      integration_key: "conversation_media",
      operation: "store",
      status: "failure",
      detail: error.message,
      organization_id,
      account_id,
      bot_id: stored_message.bot_id ?? null,
    }).catch(() => {});
  }
}

// Núcleo del inbound, agnóstico de canal. `channel` (whatsapp/instagram/messenger)
// abstrae identidad, envío y descarga de media; `event` es el mensaje ya
// normalizado por el handler del webhook ({channel_ref, sender_id, text, media, ...}).
async function process_inbound_message(channel, dependencies, event) {
  const resolution = await channel.resolve_identity(dependencies.pool, event.channel_ref);
  const account_id = resolution.account?.id ?? null;
  const organization_id = resolution.organization?.id ?? resolution.account?.organization_id ?? null;
  const contact = await upsert_contact(dependencies.pool, {
    account_id,
    organization_id,
    channel: channel.name,
    external_id: event.sender_id,
    display_name: event.display_name ?? null,
  });
  const conversation = await upsert_conversation(dependencies.pool, {
    account_id,
    organization_id,
    bot_id: resolution.bot?.id ?? null,
    contact_id: contact.id,
    channel: channel.name,
  });
  const stored_message = await store_inbound_message(dependencies.pool, {
    account_id,
    organization_id,
    bot_id: resolution.bot?.id ?? null,
    conversation_id: conversation.id,
    contact_id: contact.id,
    channel: channel.name,
    event,
    raw_payload: event.raw,
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

  // Adjuntos: si el mensaje trae media, se descarga y guarda en S3/local (best-effort).
  await store_inbound_attachment(channel, dependencies, {
    stored_message,
    organization_id,
    account_id,
    identity: resolution,
  });

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
    summary: `Inbound ${channel.name} webhook message received.`,
    details_json: {
      channel: channel.name,
      channel_ref: event.channel_ref,
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
  // AI por scope: provider/model salen de bot > cuenta > global > env. El env es
  // el piso (config.ai_provider, default "mock"). El provider inyectado en tests
  // gana y conserva su logging; en producción se construye desde lo resuelto.
  const ai = resolve_ai_config({
    bot: resolution.bot,
    account: resolution.account,
    global: dependencies.global_ai,
    env: { provider: config.ai_provider, model: config.ai_provider === "bedrock" ? config.bedrock_model_id : config.openai_model },
  });
  const base_provider = dependencies.provider_injected
    ? dependencies.provider
    : create_model_provider({ provider: ai.provider, model: ai.model });
  const observed_provider = new observed_model_provider(base_provider, {
    pool: dependencies.pool,
    provider_name: dependencies.provider_injected ? config.ai_provider : ai.provider,
    model: dependencies.provider_injected
      ? config.ai_provider === "mock"
        ? "mock-local"
        : config.bedrock_model_id
      : ai.provider === "mock"
        ? "mock-local"
        : ai.model,
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
  // AI por default para TODOS los bots (es el edge del producto): siempre se
  // intenta clasificar con el modelo. El provider decide capacidad (OpenAI con
  // key → AI; mock o sin key → keywords). En error de AI degradamos a
  // determinístico — el inbound nunca se rompe y el fallo queda en ai_calls.
  let intents;
  try {
    ({ intents } = await observed_provider.classify_intents({
      text: normalized.normalized_text,
      use_ai_classification: true,
    }));
  } catch {
    ({ intents } = await observed_provider.classify_intents({
      text: normalized.normalized_text,
      use_ai_classification: false,
    }));
  }
  const detected_intents =
    Array.isArray(intents) && intents.length ? intents : [{ intent: "unknown", confidence: 0, reason: "no classification" }];
  // One message can carry several operations. Each detected intent carries its
  // own text segment (falling back to the full text for providers that don't
  // segment), so its extractor only parses its own clause.
  const operations = [];
  for (const classification of detected_intents) {
    operations.push(await parser.parse(classification.segment ?? normalized.normalized_text, classification));
  }
  // The first operation is the "primary" one — it drives the message's headline
  // columns and memory ingestion; the rest are extra interactions it fired.
  const primary_operation = operations[0];
  const needs_review_any = operations.some((operation) => operation.needs_review);
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

  for (const operation of operations) {
    await store_parsing_result(dependencies.pool, {
      account_id,
      organization_id,
      message_id: stored_message.id,
      parsed: operation,
    });
  }
  await record_context_event(dependencies.pool, processing_context, {
    event_type: "parsing_completed",
    event_stage: "parsing",
    title: "Parsing completed",
    summary: `Intents ${operations.map((operation) => operation.intent).join(", ")}.`,
    details_json: {
      intents: operations.map((operation) => ({
        intent: operation.intent,
        confidence: operation.confidence,
        needs_review: operation.needs_review,
      })),
    },
    source_table: "parsing_results",
    source_id: stored_message.id,
  });

  for (const operation of operations) {
    if (!operation.needs_review) {
      continue;
    }
    await create_review_item(dependencies.pool, {
      account_id,
      organization_id,
      bot_id: resolution.bot?.id ?? null,
      message_id: stored_message.id,
      reason: operation.validation_errors[0]?.message?.toString() ?? "low_confidence_or_missing_data",
      raw_text: stored_message.text_body ?? "",
      extracted_json: operation.data,
    });
  }
  if (needs_review_any) {
    await record_context_event(dependencies.pool, processing_context, {
      event_type: "review_item_created",
      event_stage: "review",
      status: "warning",
      title: "Review item created",
      summary: "Message needs human review.",
      details_json: {
        intents: operations.filter((operation) => operation.needs_review).map((operation) => operation.intent),
      },
      source_table: "review_items",
      source_id: stored_message.id,
    });
  }

  const operation_results = await route_and_dispatch_operations(dependencies, processing_context, operations);
  const handled_any = operation_results.some((result) => result.handled);
  // One operation_write event per fired interaction — each carries its action_id
  // and status, so the message trace shows the full multi-interaction decision.
  for (const result of operation_results) {
    await record_context_event(dependencies.pool, processing_context, {
      event_type: "operation_saved",
      event_stage: "operation_write",
      title: `Operation ${result.intent}`,
      summary: result.handled
        ? `Interacción ${result.intent} ejecutada${result.action_id ? ` (${result.action_id})` : ""}.`
        : `Interacción ${result.intent} sin escritura operativa.`,
      details_json: {
        intent: result.intent,
        action_id: result.action_id ?? null,
        handled: result.handled,
        action_status: result.action_status ?? null,
        report_id: result.report_id ?? null,
        metadata: result.metadata ?? {},
      },
      source_table: "messages",
      source_id: stored_message.id,
    });
  }

  if (config.memory_ingestion_enabled) {
    const memory_document = await safe_ingest_message_to_memory({
      context: processing_context,
      parsed: primary_operation,
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

  const processing_status = needs_review_any && !handled_any ? "needs_review" : handled_any ? "handled" : "unhandled";
  await update_message_parsing(
    dependencies.pool,
    stored_message.id,
    { ...primary_operation, needs_review: needs_review_any },
    processing_status,
  );
  logger.info(
    {
      message_id: stored_message.id,
      intents: operations.map((operation) => operation.intent),
      confidence: primary_operation.confidence,
    },
    "message parsed",
  );
  const reply_text = build_multi_reply(operation_results);

  if (reply_text) {
    const send_started_at = Date.now();
    const send_result = await channel.send_text(dependencies.client, resolution, {
      to: event.sender_id,
      text: reply_text,
    });
    const not_configured =
      send_result.reason === "missing_meta_credentials" ||
      send_result.raw_response?.reason === "missing_whatsapp_credentials";
    await safe_record_integration_event(dependencies.pool, {
      integration_key: channel.integration_key,
      operation: "send_message",
      status: send_result.sent ? "success" : not_configured ? "not_configured" : "failure",
      latency_ms: Date.now() - send_started_at,
      organization_id,
      account_id,
      bot_id: resolution.bot?.id ?? null,
    });
    const outbound_message = await store_outbound_message(dependencies.pool, {
      account_id,
      organization_id,
      bot_id: resolution.bot?.id ?? null,
      conversation_id: conversation.id,
      contact_id: contact.id,
      channel: channel.name,
      external_message_id: send_result.external_message_id,
      reply_to_message_id: stored_message.id,
      text_body: reply_text,
      raw_payload: {
        request: { to: event.sender_id, text: reply_text },
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
    intent: primary_operation.intent,
    intents: operations.map((operation) => operation.intent),
    needs_review: needs_review_any,
    reply_text,
    agent_key: null,
  };
}

// Dependencias comunes a todos los canales. El provider inyectado (tests/spies)
// GANA y conserva el logging env (provider_name "mock"); sin inyección el provider
// se construye por mensaje desde la config resuelta (bot > cuenta > global > env).
// `client` es el cliente de envío/descarga del canal (inyectable en tests).
async function build_channel_dependencies(dependencies, client) {
  return {
    pool: dependencies.pool,
    provider: dependencies.provider ?? create_model_provider(),
    provider_injected: Boolean(dependencies.provider),
    global_ai: await get_platform_ai_config(dependencies.pool),
    client,
    memory_store: dependencies.memory_store,
    embedding_gateway: dependencies.embedding_gateway,
  };
}

export async function handle_whatsapp_webhook_payload(payload, dependencies) {
  logger.info({ object: payload.object }, "inbound webhook received");
  const client = dependencies.whatsapp_client ?? new meta_whatsapp_client();
  const complete_dependencies = await build_channel_dependencies(dependencies, client);
  const results = [];

  // WhatsApp Cloud API: entry[].changes[].value.messages[] (forma distinta a
  // IG/Messenger). Se normaliza a un evento de canal antes del núcleo compartido,
  // preservando exactamente el texto/media/raw_payload del comportamiento previo.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages?.length) {
        continue;
      }
      for (const inbound_message of value.messages) {
        const contact_profile = value.contacts?.find((contact) => contact.wa_id === inbound_message.from) ?? null;
        const media = extract_media_metadata(inbound_message);
        const event = {
          channel: whatsapp_channel.name,
          channel_ref: value.metadata?.phone_number_id ?? config.whatsapp_phone_number_id,
          sender_id: inbound_message.from,
          display_name: contact_profile?.profile?.name ?? null,
          external_message_id: inbound_message.id ?? null,
          text: extract_text_body(inbound_message),
          message_type: inbound_message.type ?? "unknown",
          media: media.media_url ? { media_url: media.media_url, media_mime_type: media.media_mime_type } : null,
          timestamp: inbound_message.timestamp ?? null,
          raw: { metadata: value.metadata ?? {}, contact: contact_profile, message: inbound_message },
        };
        results.push(await process_inbound_message(whatsapp_channel, complete_dependencies, event));
      }
    }
  }

  return results;
}

// Instagram DM + Facebook Messenger comparten la forma de webhook (Messenger
// Platform): un parser genérico produce los eventos y el núcleo es el mismo.
async function handle_meta_messaging_webhook_payload(channel, payload, dependencies) {
  logger.info({ object: payload.object, channel: channel.name }, "inbound webhook received");
  const client = dependencies.messaging_client ?? new meta_messaging_client({ channel: channel.name });
  const complete_dependencies = await build_channel_dependencies(dependencies, client);
  const events = parse_meta_messaging_payload(payload, channel.name);
  const results = [];
  for (const event of events) {
    results.push(await process_inbound_message(channel, complete_dependencies, event));
  }
  return results;
}

export function handle_instagram_webhook_payload(payload, dependencies) {
  return handle_meta_messaging_webhook_payload(instagram_channel, payload, dependencies);
}

export function handle_messenger_webhook_payload(payload, dependencies) {
  return handle_meta_messaging_webhook_payload(messenger_channel, payload, dependencies);
}
