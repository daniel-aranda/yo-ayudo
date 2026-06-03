import { compact_trace_for_message, build_message_trace } from "./trace_builder.js";
import { get_bot_by_id, update_bot_configuration } from "../bots/bot_repository.js";
import { list_knowledge_sources } from "../knowledge/knowledge_center_repository.js";

function as_array(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function compact_strings(value, remove_indexes = new Set()) {
  return as_array(value)
    .map((item, index) => ({ item: String(item ?? "").trim(), index }))
    .filter((entry) => entry.item && !remove_indexes.has(String(entry.index)))
    .map((entry) => entry.item);
}

function checked_indexes(value) {
  return new Set(compact_strings(value));
}

function row_objects(keys, body, prefix) {
  const rows = as_array(body[`${prefix}_${keys[0]}`]);

  return rows.map((_, index) => {
    const row = {};

    for (const key of keys) {
      row[key] = as_array(body[`${prefix}_${key}`])[index];
    }

    return row;
  });
}

export const available_agent_interactions = [
  {
    type: "send_whatsapp_message",
    key: "send_whatsapp_message",
    label: "Enviar mensaje de WhatsApp",
    description: "Permite que el agente envíe mensajes por WhatsApp.",
    instructions_placeholder:
      "Describe qué tipo de mensajes puede enviar este agente, cuándo debe enviarlos y qué no debe enviar.",
  },
  {
    type: "receive_whatsapp_message",
    key: "receive_whatsapp_message",
    label: "Recibir mensajes de WhatsApp",
    description: "Permite que el agente reciba y evalúe mensajes entrantes de WhatsApp.",
    instructions_placeholder:
      "Describe qué mensajes debe atender este agente, qué mensajes debe ignorar y cuándo debe pedir más contexto.",
  },
  {
    type: "consult_human",
    key: "consult_human",
    label: "Consultar humano",
    description:
      "Permite que el agente consulte a humanos cuando tenga dudas, falte knowledge o se requiera criterio humano.",
    instructions_placeholder:
      "Describe cuándo debe consultar a un humano, qué información debe incluir y qué casos no debe escalar.",
  },
];

function available_interaction_by_type(type) {
  return available_agent_interactions.find((interaction) => interaction.type === type) ?? null;
}

function parse_human_group_ids(value) {
  return compact_strings(
    as_array(value)
      .flatMap((item) => String(item ?? "").split(","))
      .map((item) => item.trim()),
  );
}

function parse_interactions(current_interactions, body) {
  if (body.interaction_type === undefined && !body.new_interaction_type) {
    return Array.isArray(current_interactions) ? current_interactions : [];
  }

  const enabled_indexes = checked_indexes(body.interaction_enabled);
  const rows = row_objects(["type", "instructions", "human_group_ids"], body, "interaction")
    .map((row, index) => ({
      type: String(row.type ?? "").trim(),
      instructions: String(row.instructions ?? "").trim(),
      human_group_ids: parse_human_group_ids(row.human_group_ids),
      enabled: enabled_indexes.has(String(index)),
    }))
    .filter((row) => available_interaction_by_type(row.type));

  const new_type = String(body.new_interaction_type ?? "").trim();
  if (new_type && available_interaction_by_type(new_type)) {
    rows.push({
      type: new_type,
      instructions: String(body.new_interaction_instructions ?? "").trim(),
      human_group_ids: parse_human_group_ids(body.new_interaction_human_group_ids),
      enabled: true,
    });
  }

  const by_type = new Map();
  for (const row of rows) {
    if (!by_type.has(row.type)) {
      const available = available_interaction_by_type(row.type);
      by_type.set(row.type, {
        key: available.key,
        type: available.type,
        label: available.label,
        enabled: row.enabled,
        instructions: row.instructions,
        ...(row.type === "consult_human" ? { human_group_ids: row.human_group_ids } : {}),
      });
    }
  }

  return [...by_type.values()];
}

function builder_definition_from_body(current_definition, body) {
  const identity = current_definition.identity ?? {};
  const behavior = current_definition.behavior ?? {};
  const operating_instructions = String(
    body.instrucciones_operativas ?? behavior.operating_instructions ?? current_definition.prompt_base ?? "",
  ).trim();
  const constraints_text = String(
    body.constraints_text ?? (Array.isArray(behavior.constraints) ? behavior.constraints.join("\n") : behavior.constraints ?? ""),
  ).trim();

  return {
    identity: {
      name: String(body.name ?? identity.name ?? current_definition.name ?? "").trim(),
      description: String(body.description ?? identity.description ?? current_definition.description ?? "").trim(),
      goal: String(body.goal ?? identity.goal ?? current_definition.goal ?? "").trim(),
      status: body.status ?? identity.status ?? current_definition.status ?? "active",
      type: body.bot_type ?? identity.type ?? current_definition.type ?? "custom",
    },
    behavior: {
      language: String(body.behavior_language ?? behavior.language ?? "es-MX").trim() || "es-MX",
      tone: String(body.behavior_tone ?? behavior.tone ?? "professional").trim(),
      operating_instructions,
      constraints: constraints_text,
    },
    knowledge_source_ids: compact_strings(body.knowledge_source_ids),
    interactions: parse_interactions(current_definition.interactions, body),
  };
}

export async function get_inspector_home(pool) {
  const [business, bots] = await Promise.all([
    pool.query("SELECT * FROM organizations WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"),
    pool.query(`
      SELECT
        bots.*,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM bots
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      WHERE organizations.status = 'active'
        AND accounts.status = 'active'
        AND bots.status = 'active'
      ORDER BY bots.updated_at DESC
    `),
  ]);

  return {
    business: business.rows[0] ?? null,
    bots: bots.rows,
  };
}

export async function get_organization_view(pool, organization_id) {
  const organization = await pool.query("SELECT * FROM organizations WHERE id = $1", [organization_id]);
  const accounts = await pool.query("SELECT * FROM accounts WHERE organization_id = $1 AND status = 'active' ORDER BY name", [
    organization_id,
  ]);
  const bots = await pool.query("SELECT * FROM bots WHERE organization_id = $1 AND status = 'active' ORDER BY name", [
    organization_id,
  ]);

  return {
    organization: organization.rows[0],
    accounts: accounts.rows,
    bots: bots.rows,
  };
}

export async function get_account_view(pool, account_id) {
  const account = await pool.query(
    `
      SELECT accounts.*, organizations.name AS organization_name
      FROM accounts
      JOIN organizations ON organizations.id = accounts.organization_id
      WHERE accounts.id = $1
      LIMIT 1
    `,
    [account_id],
  );
  const bots = await pool.query("SELECT * FROM bots WHERE account_id = $1 AND status = 'active' ORDER BY name", [
    account_id,
  ]);

  return {
    account: account.rows[0],
    bots: bots.rows,
  };
}

export async function get_bot_view(pool, bot_id) {
  const bot = await pool.query(
    `
      SELECT
        bots.*,
        bot_profiles.name AS bot_profile_name,
        accounts.name AS account_name,
        organizations.name AS organization_name,
        whatsapp_phone_numbers.display_phone_number,
        whatsapp_phone_numbers.phone_number_id
      FROM bots
      LEFT JOIN bot_profiles ON bot_profiles.id = bots.bot_profile_id
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      LEFT JOIN phone_number_bot_assignments
        ON phone_number_bot_assignments.bot_id = bots.id
       AND phone_number_bot_assignments.status = 'active'
       AND phone_number_bot_assignments.active_key = 'active'
      LEFT JOIN whatsapp_phone_numbers
        ON whatsapp_phone_numbers.id = phone_number_bot_assignments.whatsapp_phone_number_id
      WHERE bots.id = $1
      LIMIT 1
    `,
    [bot_id],
  );
  const bot_row = bot.rows[0] ?? null;
  const knowledge_source_ids = compact_strings(bot_row?.definition_json?.knowledge_source_ids ?? bot_row?.knowledge_base_ids_json ?? []);
  let knowledge_sources = [];
  let available_knowledge_sources = [];

  if (knowledge_source_ids.length) {
    const placeholders = knowledge_source_ids.map((_, index) => `$${index + 1}`).join(", ");
    const result = await pool.query(
      `
        SELECT *
        FROM knowledge_sources
        WHERE id IN (${placeholders})
        ORDER BY name
      `,
      knowledge_source_ids,
    );
    knowledge_sources = result.rows;
  }

  if (bot_row) {
    available_knowledge_sources = await list_knowledge_sources(pool, {
      organization_id: bot_row.organization_id,
      account_id: bot_row.account_id,
      limit: 200,
    });
  }

  const conversations = await get_bot_conversations(pool, { bot_id, limit: 10 });
  const stats = await pool.query(
    `
      SELECT
        (SELECT count(*)::int FROM conversations WHERE bot_id = $1) AS conversations_count,
        (SELECT count(DISTINCT contact_id)::int FROM conversations WHERE bot_id = $1) AS senders_count,
        (SELECT count(*)::int FROM messages WHERE bot_id = $1 AND created_at >= now() - interval '24 hours') AS messages_24h,
        (SELECT count(*)::int FROM agent_runs WHERE bot_id = $1) AS agent_runs_count,
        (SELECT count(*)::int FROM memory_documents WHERE bot_id = $1) AS memory_docs_count,
        (SELECT count(*)::int FROM review_items WHERE bot_id = $1 AND status IN ('pending', 'open')) AS pending_review_count
    `,
    [bot_id],
  );
  const agent_runs = await pool.query("SELECT * FROM agent_runs WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 10", [
    bot_id,
  ]);
  const memory_documents = await pool.query(
    "SELECT * FROM memory_documents WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 10",
    [bot_id],
  );
  const review_items = await pool.query("SELECT * FROM review_items WHERE bot_id = $1 ORDER BY created_at DESC LIMIT 10", [
    bot_id,
  ]);

  return {
    bot: bot_row,
    stats: stats.rows[0],
    knowledge_sources,
    available_knowledge_sources,
    available_interactions: available_agent_interactions,
    conversations: conversations.conversations,
    agent_runs: agent_runs.rows,
    memory_documents: memory_documents.rows,
    review_items: review_items.rows,
  };
}

export async function update_bot_builder_view(pool, bot_id, body) {
  const bot = await get_bot_by_id(pool, bot_id);

  if (!bot) {
    return null;
  }

  const definition_json = builder_definition_from_body(bot.definition_json ?? {}, body);

  return update_bot_configuration(pool, bot_id, {
    name: definition_json.identity?.name || bot.name,
    description: definition_json.identity?.description || null,
    status: body.status ?? bot.status,
    prompt_base: definition_json.behavior?.operating_instructions ?? bot.prompt_base,
    instrucciones_operativas: definition_json.behavior?.operating_instructions ?? bot.instrucciones_operativas,
    tono: definition_json.behavior?.tone ?? bot.tono,
    knowledge_base_ids_json: definition_json.knowledge_source_ids ?? bot.knowledge_base_ids_json ?? [],
    definition_json,
  });
}

export async function get_bot_conversations(pool, input) {
  const filters = ["c.bot_id = $1"];
  const values = [input.bot_id];

  if (input.status) {
    values.push(input.status);
    filters.push(`c.status = $${values.length}`);
  }

  if (input.search) {
    values.push(`%${input.search.toLowerCase()}%`);
    filters.push(`(lower(contacts.display_name) LIKE $${values.length} OR contacts.whatsapp_phone LIKE $${values.length})`);
  }

  values.push(input.limit ?? 50);
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.tenant_id,
        c.branch_id,
        c.bot_id,
        c.contact_id,
        c.channel,
        c.status,
        c.last_message_at,
        c.human_handoff_status,
        c.created_at,
        c.updated_at,
        contacts.display_name,
        contacts.whatsapp_phone
      FROM conversations c
      JOIN contacts ON contacts.id = c.contact_id
      WHERE ${filters.join(" AND ")}
      ORDER BY c.last_message_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const conversations = [];

  for (const conversation of result.rows) {
    const [message_counts, last_message, last_agent, pending_review] = await Promise.all([
      pool.query(
        "SELECT count(*)::int AS messages_count, max(created_at) AS last_activity FROM messages WHERE conversation_id = $1",
        [conversation.id],
      ),
      pool.query(
        `
          SELECT parsed_intent, text_body
          FROM messages
          WHERE conversation_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [conversation.id],
      ),
      pool.query(
        `
          SELECT agent_key
          FROM agent_runs
          WHERE conversation_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [conversation.id],
      ),
      pool.query(
        `
          SELECT count(*)::int AS pending_review_count
          FROM review_items
          JOIN messages ON messages.id = review_items.message_id
          WHERE messages.conversation_id = $1
            AND review_items.status IN ('pending', 'open')
        `,
        [conversation.id],
      ),
    ]);

    conversations.push({
      ...conversation,
      last_activity: message_counts.rows[0]?.last_activity ?? conversation.last_message_at,
      messages_count: message_counts.rows[0]?.messages_count ?? 0,
      pending_review_count: pending_review.rows[0]?.pending_review_count ?? 0,
      last_intent: last_message.rows[0]?.parsed_intent ?? null,
      last_agent: last_agent.rows[0]?.agent_key ?? null,
      last_message: last_message.rows[0]?.text_body ?? null,
    });
  }

  return { conversations };
}

export async function get_conversation_view(pool, conversation_id) {
  const conversation = await pool.query(
    `
      SELECT
        conversations.*,
        contacts.display_name,
        contacts.whatsapp_phone,
        tenants.name AS tenant_name,
        bots.name AS bot_name,
        bots.id AS bot_id,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM conversations
      JOIN contacts ON contacts.id = conversations.contact_id
      JOIN tenants ON tenants.id = conversations.tenant_id
      LEFT JOIN bots ON bots.id = conversations.bot_id
      LEFT JOIN accounts ON accounts.id = bots.account_id
      LEFT JOIN organizations ON organizations.id = bots.organization_id
      WHERE conversations.id = $1
      LIMIT 1
    `,
    [conversation_id],
  );
  const messages = await pool.query(
    "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
    [conversation_id],
  );
  const messages_with_trace = [];

  for (const message of messages.rows) {
    messages_with_trace.push({
      message,
      compact_trace_summary: await compact_trace_for_message(pool, message),
    });
  }

  return {
    conversation: conversation.rows[0],
    messages: messages_with_trace,
  };
}

export async function get_message_trace_view(pool, message_id) {
  return build_message_trace(pool, { message_id });
}
