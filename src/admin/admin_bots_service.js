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

const BOT_TYPE_FILTERS = new Set(["system", "custom", "all"]);

export async function get_bots_admin_view(pool, { since_hours = 168, q = "", type = "system", include_archived = false } = {}) {
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

  let rows = bots.rows.map((bot) => ({
    id: bot.id,
    name: bot.name,
    slug: bot.slug,
    description: bot.description,
    status: bot.status,
    bot_type: bot.bot_type || bot.channel,
    account_id: bot.account_id,
    account_name: bot.account_name,
    organization_name: bot.organization_name,
    messages: messages_by_bot.get(bot.id)?.messages ?? 0,
    conversations: conversations_by_bot.get(bot.id)?.conversations ?? 0,
    errors: (errors_by_bot.get(bot.id)?.errors ?? 0) + (guardrails_by_bot.get(bot.id)?.guardrails ?? 0),
    last_at: messages_by_bot.get(bot.id)?.last_at ?? null,
  }));

  // Vista por default: catálogo de bots de sistema vivos. Lo archivado y los
  // custom se piden explícito (?archived=1, ?type=custom|all).
  const type_filter = BOT_TYPE_FILTERS.has(type) ? type : "system";
  const search = String(q ?? "").trim();
  const search_lower = search.toLowerCase();

  if (type_filter !== "all") {
    rows = rows.filter((row) => row.bot_type === type_filter);
  }

  if (search_lower) {
    rows = rows.filter((row) =>
      [row.name, row.slug, row.description, row.account_name, row.organization_name].some((value) =>
        String(value ?? "").toLowerCase().includes(search_lower),
      ),
    );
  }

  // Conteo de archivados dentro del filtro actual: alimenta el link discreto
  // "Ver archivados (N)" aunque estén ocultos.
  const archived_count = rows.filter((row) => row.status === "archived").length;

  if (!include_archived) {
    rows = rows.filter((row) => row.status !== "archived");
  }

  const totals = {
    bots: rows.length,
    active: rows.filter((row) => row.status === "active").length,
    messages: rows.reduce((sum, row) => sum + row.messages, 0),
    errors: rows.reduce((sum, row) => sum + row.errors, 0),
  };

  return {
    bots: rows,
    totals,
    since_hours,
    archived_count,
    filters: { q: search, type: type_filter, include_archived: Boolean(include_archived) },
  };
}

// Mueve un bot a otra cuenta. Solo bots "limpios": sin conversaciones/mensajes
// y sin canales asignados activos — el historial y los canales están scopeados
// a la cuenta y moverlos corrompería ese aislamiento. El knowledge asignado se
// limpia (las fuentes pertenecen a la cuenta origen) y el bot_profile legacy
// también (es por cuenta). Devuelve { bot } o { error, message }.
export async function move_bot_to_account(pool, { bot_id, account_id }) {
  const bot = (await pool.query("SELECT * FROM bots WHERE id = $1 LIMIT 1", [bot_id])).rows[0];
  if (!bot) {
    return { error: "bot_not_found", message: "El bot no existe." };
  }

  const target = (
    await pool.query("SELECT id, organization_id, name FROM accounts WHERE id = $1 LIMIT 1", [account_id])
  ).rows[0];
  if (!target) {
    return { error: "account_not_found", message: "La cuenta destino no existe." };
  }

  if (target.id === bot.account_id) {
    return { bot };
  }

  const [conversations, messages, whatsapp_assignments, instagram_assignments] = await Promise.all([
    pool.query("SELECT count(*)::int AS count FROM conversations WHERE bot_id = $1", [bot_id]),
    pool.query("SELECT count(*)::int AS count FROM messages WHERE bot_id = $1", [bot_id]),
    pool.query("SELECT count(*)::int AS count FROM phone_number_bot_assignments WHERE bot_id = $1 AND status = 'active'", [
      bot_id,
    ]),
    pool.query(
      "SELECT count(*)::int AS count FROM instagram_account_bot_assignments WHERE bot_id = $1 AND status = 'active'",
      [bot_id],
    ),
  ]);

  if ((conversations.rows[0]?.count ?? 0) > 0 || (messages.rows[0]?.count ?? 0) > 0) {
    return {
      error: "bot_has_history",
      message: "El bot ya tiene conversaciones o mensajes en su cuenta actual; no se puede mover sin corromper ese historial.",
    };
  }

  if ((whatsapp_assignments.rows[0]?.count ?? 0) > 0 || (instagram_assignments.rows[0]?.count ?? 0) > 0) {
    return {
      error: "bot_has_channels",
      message: "El bot tiene canales activos asignados; desconéctalos antes de moverlo.",
    };
  }

  const definition = bot.definition_json ?? {};
  const moved_definition = {
    ...definition,
    knowledge_source_ids: [],
  };
  const updated = await pool.query(
    `
      UPDATE bots
      SET
        account_id = $2,
        organization_id = $3,
        bot_profile_id = NULL,
        knowledge_base_ids_json = '[]'::jsonb,
        definition_json = $4::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [bot_id, target.id, target.organization_id, JSON.stringify(moved_definition)],
  );

  return { bot: updated.rows[0] };
}
