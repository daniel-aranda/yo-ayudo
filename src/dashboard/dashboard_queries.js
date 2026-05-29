export async function get_dashboard_home(pool) {
  const businesses = await pool.query(
    `
      SELECT
        organizations.id,
        organizations.name,
        organizations.slug,
        organizations.status,
        COUNT(DISTINCT accounts.id)::int AS account_count,
        COUNT(DISTINCT bots.id)::int AS bot_count
      FROM organizations
      LEFT JOIN accounts ON accounts.organization_id = organizations.id
      LEFT JOIN bots ON bots.organization_id = organizations.id AND bots.status = 'active'
      WHERE organizations.status = 'active'
      GROUP BY organizations.id
      ORDER BY organizations.created_at DESC
    `,
  );

  return { businesses: businesses.rows };
}

export async function get_business_dashboard_data(pool, business_id) {
  const business = await pool.query("SELECT * FROM organizations WHERE id = $1", [business_id]);
  const accounts = await pool.query(
    `
      SELECT
        accounts.*,
        COUNT(DISTINCT bots.id)::int AS bot_count,
        COUNT(DISTINCT whatsapp_phone_numbers.id)::int AS channel_count,
        COUNT(DISTINCT conversations.id)::int AS conversation_count,
        MAX(conversations.last_message_at) AS last_activity
      FROM accounts
      LEFT JOIN bots ON bots.account_id = accounts.id AND bots.status = 'active'
      LEFT JOIN whatsapp_phone_numbers ON whatsapp_phone_numbers.account_id = accounts.id AND whatsapp_phone_numbers.status = 'active'
      LEFT JOIN conversations ON conversations.bot_id = bots.id
      WHERE accounts.organization_id = $1
        AND accounts.status = 'active'
      GROUP BY accounts.id
      ORDER BY accounts.name
    `,
    [business_id],
  );

  return {
    business: business.rows[0] ?? null,
    accounts: accounts.rows,
  };
}

export async function get_account_dashboard_data(pool, input) {
  const account = await pool.query(
    `
      SELECT
        accounts.*,
        organizations.name AS business_name,
        organizations.slug AS business_slug,
        organizations.status AS business_status
      FROM accounts
      JOIN organizations ON organizations.id = accounts.organization_id
      WHERE accounts.organization_id = $1
        AND accounts.id = $2
      LIMIT 1
    `,
    [input.business_id, input.account_id],
  );
  const bots = await pool.query(
    `
      SELECT
        bots.*,
        whatsapp_phone_numbers.display_phone_number,
        whatsapp_phone_numbers.phone_number_id
      FROM bots
      LEFT JOIN phone_number_bot_assignments
        ON phone_number_bot_assignments.bot_id = bots.id
       AND phone_number_bot_assignments.status = 'active'
       AND phone_number_bot_assignments.active_key = 'active'
      LEFT JOIN whatsapp_phone_numbers
        ON whatsapp_phone_numbers.id = phone_number_bot_assignments.whatsapp_phone_number_id
      WHERE bots.account_id = $1
        AND bots.status = 'active'
      ORDER BY bots.bot_type, bots.name
    `,
    [input.account_id],
  );
  const channels = await pool.query(
    `
      SELECT *
      FROM whatsapp_phone_numbers
      WHERE account_id = $1
        AND status = 'active'
      ORDER BY display_phone_number NULLS LAST, phone_number_id
    `,
    [input.account_id],
  );
  const conversations = await pool.query(
    `
      SELECT
        conversations.id,
        conversations.status,
        conversations.channel,
        conversations.last_message_at,
        contacts.display_name,
        contacts.whatsapp_phone,
        bots.name AS bot_name,
        messages.text_body AS last_message
      FROM conversations
      JOIN bots ON bots.id = conversations.bot_id
      JOIN contacts ON contacts.id = conversations.contact_id
      LEFT JOIN LATERAL (
        SELECT text_body
        FROM messages
        WHERE messages.conversation_id = conversations.id
        ORDER BY messages.created_at DESC
        LIMIT 1
      ) messages ON true
      WHERE bots.account_id = $1
      ORDER BY conversations.last_message_at DESC NULLS LAST, conversations.created_at DESC
      LIMIT 10
    `,
    [input.account_id],
  );
  const events = await pool.query(
    `
      SELECT *
      FROM processing_events
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `,
    [input.account_id],
  );
  const stats = await pool.query(
    `
      SELECT
        (SELECT count(*)::int FROM bots WHERE account_id = $1 AND status = 'active') AS bots_count,
        (SELECT count(*)::int FROM whatsapp_phone_numbers WHERE account_id = $1 AND status = 'active') AS channels_count,
        (
          SELECT count(*)::int
          FROM conversations
          JOIN bots ON bots.id = conversations.bot_id
          WHERE bots.account_id = $1
        ) AS conversations_count,
        (
          SELECT count(*)::int
          FROM processing_events
          WHERE account_id = $1
            AND status = 'error'
        ) AS error_events_count
    `,
    [input.account_id],
  );

  return {
    account: account.rows[0] ?? null,
    bots: bots.rows,
    channels: channels.rows,
    conversations: conversations.rows,
    events: events.rows,
    stats: stats.rows[0] ?? {},
  };
}
