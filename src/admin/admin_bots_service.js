// Global bots admin: every bot across the platform with operational counts
// (messages, conversations, errors, last activity). Errors = failed/blocked
// action executions + guardrail events in the window.
const ACTION_ERROR_STATUSES = ["failed", "blocked", "not_implemented", "pending_provider", "unknown_action"];

function index_by_bot(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.bot_id, row);
  }
  return map;
}

export async function get_bots_admin_view(pool, { since_hours = 168 } = {}) {
  const since = new Date(Date.now() - since_hours * 60 * 60 * 1000);
  const [bots, messages, conversations, action_errors, guardrails] = await Promise.all([
    pool.query(
      `
        SELECT b.id, b.name, b.slug, b.status, b.bot_type, b.channel, b.description,
               b.account_id, a.name AS account_name, b.organization_id, o.name AS organization_name
        FROM bots b
        JOIN accounts a ON a.id = b.account_id
        JOIN organizations o ON o.id = b.organization_id
        ORDER BY o.name, a.name, b.name
      `,
    ),
    pool.query(
      `SELECT bot_id, SUM(CASE WHEN created_at >= $1 THEN 1 ELSE 0 END)::int AS messages, MAX(created_at) AS last_at
       FROM messages WHERE bot_id IS NOT NULL GROUP BY bot_id`,
      [since],
    ),
    pool.query(
      "SELECT bot_id, count(*)::int AS conversations FROM conversations WHERE bot_id IS NOT NULL GROUP BY bot_id",
    ),
    pool.query(
      `SELECT bot_id, SUM(CASE WHEN status IN ('failed', 'blocked', 'not_implemented', 'pending_provider', 'unknown_action') AND created_at >= $1 THEN 1 ELSE 0 END)::int AS errors
       FROM action_audit_logs WHERE bot_id IS NOT NULL GROUP BY bot_id`,
      [since],
    ),
    pool.query(
      `SELECT bot_id, SUM(CASE WHEN created_at >= $1 THEN 1 ELSE 0 END)::int AS guardrails
       FROM bot_guardrail_events WHERE bot_id IS NOT NULL GROUP BY bot_id`,
      [since],
    ),
  ]);

  const messages_by_bot = index_by_bot(messages.rows);
  const conversations_by_bot = index_by_bot(conversations.rows);
  const errors_by_bot = index_by_bot(action_errors.rows);
  const guardrails_by_bot = index_by_bot(guardrails.rows);

  const rows = bots.rows.map((bot) => ({
    id: bot.id,
    name: bot.name,
    description: bot.description,
    status: bot.status,
    bot_type: bot.bot_type || bot.channel,
    account_name: bot.account_name,
    organization_name: bot.organization_name,
    messages: messages_by_bot.get(bot.id)?.messages ?? 0,
    conversations: conversations_by_bot.get(bot.id)?.conversations ?? 0,
    errors: (errors_by_bot.get(bot.id)?.errors ?? 0) + (guardrails_by_bot.get(bot.id)?.guardrails ?? 0),
    last_at: messages_by_bot.get(bot.id)?.last_at ?? null,
  }));

  const totals = {
    bots: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    messages: rows.reduce((sum, row) => sum + row.messages, 0),
    errors: rows.reduce((sum, row) => sum + row.errors, 0),
  };

  return { bots: rows, totals, since_hours };
}
