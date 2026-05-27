import { config } from "../app/config.js";
import { date_key_in_timezone } from "../shared/dates.js";
import { logger } from "../shared/logger.js";
import { agent_router } from "../agents/agent_router.js";
import { handler_for_agent } from "../agents/agent_registry.js";
import { create_model_provider } from "../ai/provider_factory.js";
import { observed_model_provider } from "../ai/observed_provider.js";
import { message_intent_parser } from "./message_intent_parser.js";
import { dispatch_operation } from "./operation_dispatcher.js";
import { build_reply } from "./response_builder.js";
import { meta_whatsapp_client } from "../channels/whatsapp/whatsapp_client.js";
import { extract_media_metadata, extract_text_body } from "../channels/whatsapp/whatsapp_message_parser.js";
import { safe_ingest_message_to_memory } from "../memory/memory_ingestion_service.js";
import { record_context_event, safe_record_processing_event } from "../processing_events/processing_event_service.js";

async function resolve_tenant_by_phone_number_id(pool, phone_number_id) {
  const result = await pool.query(
    `
      SELECT
        tenants.*,
        branches.id AS branch_id,
        branches.name AS branch_name,
        branches.address AS branch_address,
        branches.phone AS branch_phone,
        branches.timezone AS branch_timezone,
        branches.status AS branch_status,
        branches.created_at AS branch_created_at,
        branches.updated_at AS branch_updated_at,
        bot_profiles.id AS bot_profile_id,
        bot_profiles.name AS bot_profile_name,
        bot_profiles.timezone AS bot_profile_timezone,
        bot_profiles.solution_template_id AS bot_profile_solution_template_id,
        solution_templates.id AS solution_template_id,
        solution_templates.key AS solution_template_key,
        bots.id AS bot_id,
        bots.name AS bot_name,
        bots.slug AS bot_slug,
        bots.channel AS bot_channel,
        bots.status AS bot_status,
        bots.organization_id,
        bots.account_id,
        organizations.name AS organization_name,
        organizations.slug AS organization_slug,
        accounts.name AS account_name,
        accounts.slug AS account_slug
      FROM whatsapp_phone_numbers
      JOIN tenants ON tenants.id = whatsapp_phone_numbers.tenant_id
      LEFT JOIN branches ON branches.id = whatsapp_phone_numbers.branch_id
      LEFT JOIN bot_profiles ON bot_profiles.tenant_id = tenants.id
        AND (bot_profiles.branch_id = branches.id OR bot_profiles.branch_id IS NULL)
        AND bot_profiles.status = 'active'
      LEFT JOIN solution_templates ON solution_templates.id = bot_profiles.solution_template_id
      LEFT JOIN bots ON bots.tenant_id = tenants.id
        AND (bots.bot_profile_id = bot_profiles.id OR bots.bot_profile_id IS NULL)
        AND bots.status = 'active'
      LEFT JOIN organizations ON organizations.id = bots.organization_id
      LEFT JOIN accounts ON accounts.id = bots.account_id
      WHERE whatsapp_phone_numbers.phone_number_id = $1
        AND whatsapp_phone_numbers.status = 'active'
      ORDER BY bot_profiles.branch_id NULLS LAST
      LIMIT 1
    `,
    [phone_number_id],
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error(`No tenant configured for WhatsApp phone_number_id ${phone_number_id}`);
  }

  return {
    tenant: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      timezone: row.timezone,
    },
    branch: row.branch_id
      ? {
          id: row.branch_id,
          tenant_id: row.id,
          name: row.branch_name,
          address: row.branch_address,
          phone: row.branch_phone,
          timezone: row.branch_timezone,
          status: row.branch_status,
        }
      : null,
    bot_profile: row.bot_profile_id
      ? {
          id: row.bot_profile_id,
          name: row.bot_profile_name,
          timezone: row.bot_profile_timezone,
          solution_template_id: row.bot_profile_solution_template_id,
          solution_template_key: row.solution_template_key,
        }
      : null,
    solution_template: row.solution_template_id
      ? {
          id: row.solution_template_id,
          key: row.solution_template_key,
        }
      : null,
    organization: row.organization_id
      ? {
          id: row.organization_id,
          name: row.organization_name,
          slug: row.organization_slug,
        }
      : null,
    account: row.account_id
      ? {
          id: row.account_id,
          organization_id: row.organization_id,
          name: row.account_name,
          slug: row.account_slug,
        }
      : null,
    bot: row.bot_id
      ? {
          id: row.bot_id,
          organization_id: row.organization_id,
          account_id: row.account_id,
          tenant_id: row.id,
          bot_profile_id: row.bot_profile_id,
          name: row.bot_name,
          slug: row.bot_slug,
          channel: row.bot_channel,
          status: row.bot_status,
        }
      : null,
  };
}

async function upsert_contact(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO contacts (tenant_id, branch_id, whatsapp_phone, display_name, metadata_json)
      VALUES ($1, $2, $3, $4, '{}'::jsonb)
      ON CONFLICT (tenant_id, whatsapp_phone)
      DO UPDATE SET
        branch_id = COALESCE(EXCLUDED.branch_id, contacts.branch_id),
        display_name = COALESCE(EXCLUDED.display_name, contacts.display_name),
        updated_at = now()
      RETURNING *
    `,
    [input.tenant_id, input.branch_id, input.whatsapp_phone, input.display_name],
  );

  return result.rows[0];
}

async function upsert_conversation(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO conversations (tenant_id, branch_id, bot_id, contact_id, channel, status, last_message_at)
      VALUES ($1, $2, $4, $3, 'whatsapp', 'open', now())
      ON CONFLICT (tenant_id, contact_id, channel)
      DO UPDATE SET
        branch_id = COALESCE(EXCLUDED.branch_id, conversations.branch_id),
        bot_id = COALESCE($4, conversations.bot_id),
        status = 'open',
        last_message_at = now(),
        updated_at = now()
      RETURNING *
    `,
    [input.tenant_id, input.branch_id, input.contact_id, input.bot_id],
  );

  if (input.bot_id && !result.rows[0].bot_id) {
    await pool.query("UPDATE conversations SET bot_id = $2 WHERE id = $1", [result.rows[0].id, input.bot_id]);
    result.rows[0].bot_id = input.bot_id;
  }

  return result.rows[0];
}

async function store_inbound_message(pool, input) {
  const media = extract_media_metadata(input.inbound_message);
  const result = await pool.query(
    `
      INSERT INTO messages (
        tenant_id,
        branch_id,
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
      input.tenant_id,
      input.branch_id,
      input.bot_id,
      input.conversation_id,
      input.contact_id,
      input.inbound_message.id ?? null,
      input.inbound_message.type ?? "unknown",
      JSON.stringify(input.raw_payload),
      extract_text_body(input.inbound_message),
      media.media_url,
      media.media_mime_type,
    ],
  );

  logger.info({ message_id: result.rows[0].id }, "message stored");
  return result.rows[0];
}

async function store_parsing_result(pool, input) {
  await pool.query(
    `
      INSERT INTO parsing_results (
        tenant_id,
        branch_id,
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
      input.tenant_id,
      input.branch_id,
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
        tenant_id,
        branch_id,
        bot_id,
        message_id,
        reason,
        raw_text,
        extracted_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.tenant_id,
      input.branch_id,
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
        tenant_id,
        branch_id,
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
      input.tenant_id,
      input.branch_id,
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

async function route_and_dispatch_operation(dependencies, processing_context, parsed) {
  if (!config.agent_router_enabled) {
    return {
      routing_result: null,
      handle_result: await dispatch_operation(processing_context, parsed),
    };
  }

  try {
    const router = new agent_router({ pool: dependencies.pool });
    const routing_result = await router.route_message({
      tenant_id: processing_context.tenant.id,
      branch_id: processing_context.branch?.id ?? null,
      contact_id: processing_context.contact.id,
      conversation_id: processing_context.conversation.id,
      message_id: processing_context.message.id,
      bot_id: processing_context.bot?.id ?? null,
      bot_profile_id: processing_context.bot_profile?.id ?? null,
      solution_template_id: processing_context.bot_profile?.solution_template_id ?? null,
      parsed_intent: parsed.intent,
      parsed_json: parsed.data,
      text_body: processing_context.message.text_body ?? "",
    });
    const agent_handler = handler_for_agent(routing_result.agent_key);

    return {
      routing_result,
      handle_result: await agent_handler(processing_context, parsed),
    };
  } catch (error) {
    logger.error({ err: error, message_id: processing_context.message.id }, "agent routing failed");
    return {
      routing_result: {
        agent_key: "unknown_agent",
        confidence: 0,
        reason: "router failed; used direct dispatcher fallback",
        retrieved_context: [],
      },
      handle_result: await dispatch_operation(processing_context, parsed),
    };
  }
}

async function process_inbound_message(dependencies, input) {
  const phone_number_id = input.value.metadata?.phone_number_id ?? config.whatsapp_phone_number_id;
  const resolution = await resolve_tenant_by_phone_number_id(dependencies.pool, phone_number_id);
  const contact_profile = input.value.contacts?.find((contact) => contact.wa_id === input.inbound_message.from);
  const contact = await upsert_contact(dependencies.pool, {
    tenant_id: resolution.tenant.id,
    branch_id: resolution.branch?.id ?? null,
    whatsapp_phone: input.inbound_message.from,
    display_name: contact_profile?.profile?.name ?? null,
  });
  const conversation = await upsert_conversation(dependencies.pool, {
    tenant_id: resolution.tenant.id,
    branch_id: resolution.branch?.id ?? null,
    bot_id: resolution.bot?.id ?? null,
    contact_id: contact.id,
  });
  const stored_message = await store_inbound_message(dependencies.pool, {
    tenant_id: resolution.tenant.id,
    branch_id: resolution.branch?.id ?? null,
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
  const event_identity = {
    organization_id: resolution.organization?.id ?? null,
    account_id: resolution.account?.id ?? null,
    bot_id: resolution.bot?.id ?? null,
    tenant_id: resolution.tenant.id,
    branch_id: resolution.branch?.id ?? null,
    conversation_id: conversation.id,
    message_id: stored_message.id,
  };

  await safe_record_processing_event(dependencies.pool, {
    ...event_identity,
    event_type: "webhook_received",
    event_stage: "webhook",
    title: "Webhook received",
    summary: "Inbound WhatsApp webhook message received.",
    details_json: { phone_number_id },
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
    tenant_id: resolution.tenant.id,
    branch_id: resolution.branch?.id ?? null,
    message_id: stored_message.id,
  });
  const normalized = await observed_provider.normalize_message({ text: stored_message.text_body ?? "" });
  const operation_date = date_key_in_timezone(
    new Date(),
    resolution.bot_profile?.timezone ?? resolution.branch?.timezone ?? resolution.tenant.timezone,
  );
  const parser = new message_intent_parser(observed_provider);
  const classification = await observed_provider.classify_intent({ text: normalized.normalized_text });
  const parsed = await parser.parse(normalized.normalized_text, classification);
  const processing_context = {
    pool: dependencies.pool,
    tenant: resolution.tenant,
    branch: resolution.branch,
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
    tenant_id: resolution.tenant.id,
    branch_id: resolution.branch?.id ?? null,
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
      tenant_id: resolution.tenant.id,
      branch_id: resolution.branch?.id ?? null,
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
      tenant_id: resolution.tenant.id,
      branch_id: resolution.branch?.id ?? null,
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
