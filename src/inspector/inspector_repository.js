import { compact_trace_for_message, build_message_trace } from "./trace_builder.js";

export async function get_inspector_home(pool) {
  const [organizations, bots, conversations, errors, review_items] = await Promise.all([
    pool.query("SELECT * FROM organizations ORDER BY name"),
    pool.query(`
      SELECT
        bots.*,
        tenants.name AS tenant_name,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM bots
      JOIN tenants ON tenants.id = bots.tenant_id
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      ORDER BY bots.updated_at DESC
      LIMIT 20
    `),
    pool.query(`
      SELECT
        conversations.id,
        conversations.tenant_id,
        conversations.branch_id,
        conversations.bot_id,
        conversations.contact_id,
        conversations.channel,
        conversations.status,
        conversations.last_message_at,
        conversations.human_handoff_status,
        conversations.created_at,
        conversations.updated_at,
        contacts.display_name,
        contacts.whatsapp_phone,
        bots.name AS bot_name,
        max(messages.created_at) AS last_activity,
        count(messages.id)::int AS messages_count
      FROM conversations
      JOIN contacts ON contacts.id = conversations.contact_id
      LEFT JOIN bots ON bots.id = conversations.bot_id
      LEFT JOIN messages ON messages.conversation_id = conversations.id
      GROUP BY
        conversations.id,
        conversations.tenant_id,
        conversations.branch_id,
        conversations.bot_id,
        conversations.contact_id,
        conversations.channel,
        conversations.status,
        conversations.last_message_at,
        conversations.human_handoff_status,
        conversations.created_at,
        conversations.updated_at,
        contacts.display_name,
        contacts.whatsapp_phone,
        bots.name
      ORDER BY max(messages.created_at) DESC
      LIMIT 20
    `),
    pool.query(`
      SELECT messages.*
      FROM messages
      WHERE needs_review = true OR processing_status IN ('needs_review', 'failed')
      ORDER BY created_at DESC
      LIMIT 20
    `),
    pool.query(`
      SELECT review_items.*, messages.text_body
      FROM review_items
      JOIN messages ON messages.id = review_items.message_id
      WHERE review_items.status IN ('pending', 'open')
      ORDER BY review_items.created_at DESC
      LIMIT 20
    `),
  ]);

  return {
    organizations: organizations.rows,
    bots: bots.rows,
    conversations: conversations.rows,
    error_messages: errors.rows,
    review_items: review_items.rows,
  };
}

export async function get_organization_view(pool, organization_id) {
  const organization = await pool.query("SELECT * FROM organizations WHERE id = $1", [organization_id]);
  const accounts = await pool.query("SELECT * FROM accounts WHERE organization_id = $1 ORDER BY name", [
    organization_id,
  ]);
  const bots = await pool.query("SELECT * FROM bots WHERE organization_id = $1 ORDER BY name", [organization_id]);

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
  const bots = await pool.query("SELECT * FROM bots WHERE account_id = $1 ORDER BY name", [account_id]);

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
        tenants.name AS tenant_name,
        tenants.slug AS tenant_slug,
        bot_profiles.name AS bot_profile_name,
        accounts.name AS account_name,
        organizations.name AS organization_name,
        whatsapp_phone_numbers.display_phone_number,
        whatsapp_phone_numbers.phone_number_id
      FROM bots
      JOIN tenants ON tenants.id = bots.tenant_id
      LEFT JOIN bot_profiles ON bot_profiles.id = bots.bot_profile_id
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      LEFT JOIN whatsapp_phone_numbers ON whatsapp_phone_numbers.tenant_id = bots.tenant_id
      WHERE bots.id = $1
      LIMIT 1
    `,
    [bot_id],
  );
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
    bot: bot.rows[0],
    stats: stats.rows[0],
    conversations: conversations.conversations,
    agent_runs: agent_runs.rows,
    memory_documents: memory_documents.rows,
    review_items: review_items.rows,
  };
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
