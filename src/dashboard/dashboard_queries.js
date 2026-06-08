export async function get_dashboard_home(pool) {
  const businesses = await pool.query(
    `
      SELECT
        organizations.id,
        organizations.name,
        organizations.slug,
        organizations.status
      FROM organizations
      WHERE organizations.status = 'active'
      ORDER BY organizations.created_at DESC
    `,
  );

  const business_rows = [];
  for (const business of businesses.rows) {
    const [primary_account, account_count, bot_count] = await Promise.all([
      get_primary_account_for_business(pool, business.id),
      pool.query("SELECT count(*)::int AS count FROM accounts WHERE organization_id = $1", [business.id]),
      pool.query("SELECT count(*)::int AS count FROM bots WHERE organization_id = $1 AND status = 'active'", [business.id]),
    ]);
    business_rows.push({
      ...business,
      primary_account_id: primary_account?.id ?? null,
      account_count: account_count.rows[0]?.count ?? 0,
      bot_count: bot_count.rows[0]?.count ?? 0,
    });
  }

  return { businesses: business_rows };
}

export async function get_primary_account_for_business(pool, business_id) {
  const result = await pool.query(
    `
      SELECT id
      FROM accounts
      WHERE organization_id = $1
        AND status = 'active'
      ORDER BY created_at, name
      LIMIT 1
    `,
    [business_id],
  );

  return result.rows[0] ?? null;
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
      SELECT bots.*
      FROM bots
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
        bots.name AS bot_name
      FROM conversations
      JOIN bots ON bots.id = conversations.bot_id
      JOIN contacts ON contacts.id = conversations.contact_id
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

  const business_day_result = await pool.query(
    `
      SELECT *
      FROM op_business_days
      WHERE account_id = $1
      ORDER BY operation_date DESC, updated_at DESC
      LIMIT 1
    `,
    [input.account_id],
  );
  let operational_day = business_day_result.rows[0] ?? null;
  if (operational_day) {
    const purchases_agg = await pool.query(
      "SELECT COALESCE(SUM(total_cost), 0) AS purchases_total, count(*)::int AS purchases_count FROM op_purchases WHERE business_day_id = $1",
      [operational_day.id],
    );
    const report = await pool.query(
      "SELECT summary_text FROM op_daily_reports WHERE business_day_id = $1 ORDER BY created_at DESC LIMIT 1",
      [operational_day.id],
    );
    operational_day = {
      ...operational_day,
      purchases_total: purchases_agg.rows[0]?.purchases_total ?? 0,
      purchases_count: purchases_agg.rows[0]?.purchases_count ?? 0,
      report_summary: report.rows[0]?.summary_text ?? null,
    };
  }
  const recent_purchases = await pool.query(
    `
      SELECT item_name, quantity, unit, total_cost, supplier_name_raw, created_at
      FROM op_purchases
      WHERE account_id = $1
      ORDER BY created_at DESC
      LIMIT 5
    `,
    [input.account_id],
  );

  const conversation_rows = [];
  for (const conversation of conversations.rows) {
    const last_message = await pool.query(
      "SELECT text_body FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1",
      [conversation.id],
    );
    conversation_rows.push({ ...conversation, last_message: last_message.rows[0]?.text_body ?? null });
  }

  return {
    account: account.rows[0] ?? null,
    bots: bots.rows,
    channels: channels.rows,
    conversations: conversation_rows,
    events: events.rows,
    stats: stats.rows[0] ?? {},
    operational_day,
    recent_purchases: recent_purchases.rows,
  };
}
