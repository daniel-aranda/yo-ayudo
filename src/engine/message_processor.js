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
        solution_templates.key AS solution_template_key
      FROM whatsapp_phone_numbers
      JOIN tenants ON tenants.id = whatsapp_phone_numbers.tenant_id
      LEFT JOIN branches ON branches.id = whatsapp_phone_numbers.branch_id
      LEFT JOIN bot_profiles ON bot_profiles.tenant_id = tenants.id
        AND (bot_profiles.branch_id = branches.id OR bot_profiles.branch_id IS NULL)
        AND bot_profiles.status = 'active'
      LEFT JOIN solution_templates ON solution_templates.id = bot_profiles.solution_template_id
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
      INSERT INTO conversations (tenant_id, branch_id, contact_id, channel, status, last_message_at)
      VALUES ($1, $2, $3, 'whatsapp', 'open', now())
      ON CONFLICT (tenant_id, contact_id, channel)
      DO UPDATE SET
        branch_id = COALESCE(EXCLUDED.branch_id, conversations.branch_id),
        status = 'open',
        last_message_at = now(),
        updated_at = now()
      RETURNING *
    `,
    [input.tenant_id, input.branch_id, input.contact_id],
  );

  return result.rows[0];
}

async function store_inbound_message(pool, input) {
  const media = extract_media_metadata(input.inbound_message);
  const result = await pool.query(
    `
      INSERT INTO messages (
        tenant_id,
        branch_id,
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
      VALUES ($1, $2, $3, $4, 'whatsapp', 'inbound', $5, $6, $7::jsonb, $8, $9, $10, 'stored')
      RETURNING *
    `,
    [
      input.tenant_id,
      input.branch_id,
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
        message_id,
        reason,
        raw_text,
        extracted_json
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      input.tenant_id,
      input.branch_id,
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
  await pool.query(
    `
      INSERT INTO messages (
        tenant_id,
        branch_id,
        conversation_id,
        contact_id,
        channel,
        direction,
        external_message_id,
        message_type,
        raw_payload_json,
        text_body,
        processing_status
      )
      VALUES ($1, $2, $3, $4, 'whatsapp', 'outbound', $5, 'text', $6::jsonb, $7, 'sent')
    `,
    [
      input.tenant_id,
      input.branch_id,
      input.conversation_id,
      input.contact_id,
      input.external_message_id ?? null,
      JSON.stringify(input.raw_payload),
      input.text_body,
    ],
  );
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
    contact_id: contact.id,
  });
  const stored_message = await store_inbound_message(dependencies.pool, {
    tenant_id: resolution.tenant.id,
    branch_id: resolution.branch?.id ?? null,
    conversation_id: conversation.id,
    contact_id: contact.id,
    inbound_message: input.inbound_message,
    raw_payload: {
      metadata: input.value.metadata ?? {},
      contact: contact_profile ?? null,
      message: input.inbound_message,
    },
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

  if (parsed.needs_review) {
    await create_review_item(dependencies.pool, {
      tenant_id: resolution.tenant.id,
      branch_id: resolution.branch?.id ?? null,
      message_id: stored_message.id,
      reason: parsed.validation_errors[0]?.message?.toString() ?? "low_confidence_or_missing_data",
      raw_text: stored_message.text_body ?? "",
      extracted_json: parsed.data,
    });
  }

  const { routing_result, handle_result } = await route_and_dispatch_operation(
    dependencies,
    processing_context,
    parsed,
  );

  if (config.memory_ingestion_enabled) {
    await safe_ingest_message_to_memory({
      context: processing_context,
      parsed,
      handle_result,
      store: dependencies.memory_store,
      embedding: dependencies.embedding_gateway,
    });
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
    await store_outbound_message(dependencies.pool, {
      tenant_id: resolution.tenant.id,
      branch_id: resolution.branch?.id ?? null,
      conversation_id: conversation.id,
      contact_id: contact.id,
      external_message_id: send_result.external_message_id,
      text_body: reply_text,
      raw_payload: {
        request: { to: input.inbound_message.from, body: reply_text },
        response: send_result.raw_response,
      },
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
