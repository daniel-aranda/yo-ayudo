import { present_conversation_summary } from "../inspector/inspector_presenter.js";

// Vista admin de conversaciones a través de TODAS las cuentas, filtrable por
// cuenta/bot/estado/canal y búsqueda de contacto. Cada fila enlaza al visor del
// inspector scopeado a la cuenta (/inspector/accounts/:account_id/conversations/:id).
// Enriquecimiento por conversación (N+1) como en get_bot_conversations; cap a 100.
export async function get_conversations_admin_view(pool, input = {}) {
  const filters = [];
  const values = [];
  const add_filter = (sql, value) => {
    values.push(value);
    filters.push(sql.replace("?", `$${values.length}`));
  };

  const account_id = String(input.account_id ?? "").trim();
  const bot_id = String(input.bot_id ?? "").trim();
  const status = String(input.status ?? "").trim();
  const channel = String(input.channel ?? "").trim();
  const q = String(input.q ?? "").trim();

  if (account_id) add_filter("c.account_id = ?", account_id);
  if (bot_id) add_filter("c.bot_id = ?", bot_id);
  if (status) add_filter("c.status = ?", status);
  if (channel) add_filter("c.channel = ?", channel);
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    filters.push(`(lower(contacts.display_name) LIKE $${values.length} OR contacts.whatsapp_phone LIKE $${values.length})`);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  values.push(100);

  const result = await pool.query(
    `
      SELECT
        c.id,
        c.bot_id,
        c.account_id,
        c.channel,
        c.status,
        c.last_message_at,
        c.human_handoff_status,
        contacts.display_name,
        contacts.whatsapp_phone,
        bots.name AS bot_name,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM conversations c
      JOIN contacts ON contacts.id = c.contact_id
      LEFT JOIN bots ON bots.id = c.bot_id
      LEFT JOIN accounts ON accounts.id = c.account_id
      LEFT JOIN organizations ON organizations.id = c.organization_id
      ${where}
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT $${values.length}
    `,
    values,
  );

  const conversations = [];
  for (const conversation of result.rows) {
    const [counts, last_message] = await Promise.all([
      pool.query(
        "SELECT count(*)::int AS messages_count, max(created_at) AS last_activity FROM messages WHERE conversation_id = $1",
        [conversation.id],
      ),
      pool.query(
        "SELECT parsed_intent, text_body FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1",
        [conversation.id],
      ),
    ]);
    const enriched = {
      ...conversation,
      messages_count: counts.rows[0]?.messages_count ?? 0,
      last_activity: counts.rows[0]?.last_activity ?? conversation.last_message_at,
      last_intent: last_message.rows[0]?.parsed_intent ?? null,
      last_message: last_message.rows[0]?.text_body ?? null,
    };
    enriched.summary = present_conversation_summary(enriched);
    conversations.push(enriched);
  }

  const [accounts, bots, channels] = await Promise.all([
    pool.query("SELECT id, name FROM accounts ORDER BY name"),
    pool.query("SELECT id, name, account_id FROM bots ORDER BY name"),
    pool.query("SELECT DISTINCT channel FROM conversations WHERE channel IS NOT NULL ORDER BY channel"),
  ]);

  return {
    conversations,
    rollup: {
      total: conversations.length,
      needs_human: conversations.filter((conversation) => conversation.summary.needs_human).length,
      pending_review: conversations.reduce((sum, conversation) => sum + (conversation.summary.pending_review_count ?? 0), 0),
    },
    filters: { account_id, bot_id, status, channel, q },
    options: {
      accounts: accounts.rows,
      bots: bots.rows,
      channels: channels.rows.map((row) => row.channel),
      statuses: ["open", "active", "pending", "resolved", "closed"],
    },
  };
}
