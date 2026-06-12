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
    // Counts are active-only, matching the business page (which lists active accounts).
    const [account_count, bot_count] = await Promise.all([
      pool.query("SELECT count(*)::int AS count FROM accounts WHERE organization_id = $1 AND status = 'active'", [business.id]),
      pool.query("SELECT count(*)::int AS count FROM bots WHERE organization_id = $1 AND status = 'active'", [business.id]),
    ]);
    business_rows.push({
      ...business,
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
    "SELECT * FROM accounts WHERE organization_id = $1 AND status = 'active' ORDER BY name",
    [business_id],
  );

  // Per-account counts via grouped queries + JS merge (pg-mem rejects correlated
  // subqueries and the GROUP-BY-with-table.* form).
  const [bot_counts, channel_counts, conversation_stats] = await Promise.all([
    pool.query(
      "SELECT account_id, count(*)::int AS count FROM bots WHERE organization_id = $1 AND status = 'active' GROUP BY account_id",
      [business_id],
    ),
    pool.query(
      "SELECT account_id, count(*)::int AS count FROM whatsapp_phone_numbers WHERE organization_id = $1 AND status = 'active' GROUP BY account_id",
      [business_id],
    ),
    pool.query(
      "SELECT account_id, count(*)::int AS count, max(last_message_at) AS last_activity FROM conversations WHERE organization_id = $1 GROUP BY account_id",
      [business_id],
    ),
  ]);

  const index_by_account = (rows) => {
    const map = new Map();
    for (const row of rows) {
      map.set(row.account_id, row);
    }
    return map;
  };
  const bots_by_account = index_by_account(bot_counts.rows);
  const channels_by_account = index_by_account(channel_counts.rows);
  const conversations_by_account = index_by_account(conversation_stats.rows);

  return {
    business: business.rows[0] ?? null,
    accounts: accounts.rows.map((account) => ({
      ...account,
      bot_count: bots_by_account.get(account.id)?.count ?? 0,
      channel_count: channels_by_account.get(account.id)?.count ?? 0,
      conversation_count: conversations_by_account.get(account.id)?.count ?? 0,
      last_activity: conversations_by_account.get(account.id)?.last_activity ?? null,
    })),
  };
}

// Dashboard activity is for the business owner, not developers: action_audit_logs
// (the operations the business registered) translated to plain Spanish, plus the
// inbound messages that didn't trigger an operation. The technical pipeline trace
// (webhook/parsing/agent/memory events) lives in the inspector, not here.
const ACTIVITY_LABELS = {
  registrar_inicio_dia: "Inicio del día",
  registrar_venta: "Venta registrada",
  registrar_compra: "Compra registrada",
  registrar_inventario: "Inventario registrado",
  registrar_cierre_dia: "Día cerrado",
  registrar_nota_dia: "Nota del día",
  generar_reporte_dia: "Reporte del día",
  buscar_negocios: "Búsqueda de prospectos",
  guardar_nota: "Nota guardada",
  crear_tarea: "Tarea creada",
  generar_resumen: "Resumen generado",
  responder_con_voz: "Respuesta de voz",
};
const ACTIVITY_ERROR_STATUSES = ["failed", "blocked", "not_implemented", "pending_provider", "unknown_action"];

async function get_account_activity(pool, account_id, limit = 10) {
  const operations = await pool.query(
    `
      SELECT a.action_id, a.status, a.created_at, a.message_id,
             m.text_body, contacts.display_name, contacts.whatsapp_phone
      FROM action_audit_logs a
      LEFT JOIN messages m ON m.id = a.message_id
      LEFT JOIN contacts ON contacts.id = m.contact_id
      WHERE a.account_id = $1
      ORDER BY a.created_at DESC
      LIMIT $2
    `,
    [account_id, limit],
  );
  const op_message_ids = new Set(operations.rows.map((row) => row.message_id).filter(Boolean));

  const messages = await pool.query(
    `
      SELECT m.id, m.text_body, m.created_at, contacts.display_name, contacts.whatsapp_phone
      FROM messages m
      JOIN bots ON bots.id = m.bot_id
      LEFT JOIN contacts ON contacts.id = m.contact_id
      WHERE bots.account_id = $1
        AND m.direction = 'inbound'
      ORDER BY m.created_at DESC
      LIMIT $2
    `,
    [account_id, limit],
  );

  const items = [];
  for (const row of operations.rows) {
    items.push({
      title: ACTIVITY_LABELS[row.action_id] ?? row.action_id,
      contact: row.display_name || row.whatsapp_phone || null,
      detail: row.text_body || null,
      status: row.status === "executed" ? "ok" : ACTIVITY_ERROR_STATUSES.includes(row.status) ? "error" : "pending",
      created_at: row.created_at,
    });
  }
  for (const row of messages.rows) {
    // Skip inbound messages already represented by their operation above.
    if (op_message_ids.has(row.id)) {
      continue;
    }
    items.push({
      title: "Mensaje recibido",
      contact: row.display_name || row.whatsapp_phone || null,
      detail: row.text_body || null,
      status: "ok",
      created_at: row.created_at,
    });
  }
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items.slice(0, limit);
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
  const activity = await get_account_activity(pool, input.account_id, 10);
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
    // Scope the purchases list to THIS day, like every other metric in the panel,
    // so "Compras del día" and the table always agree (prior days are history,
    // not today's operation).
    const day_purchases = await pool.query(
      `
        SELECT item_name, quantity, unit, total_cost, supplier_name_raw, created_at
        FROM op_purchases
        WHERE business_day_id = $1
        ORDER BY created_at DESC
      `,
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
      purchases: day_purchases.rows,
      report_summary: report.rows[0]?.summary_text ?? null,
      is_closed: operational_day.status === "closed",
      // The cash/card/transfer split is only populated on close; until then,
      // hide the row instead of showing three placeholder $0 cards.
      has_sales_breakdown:
        Number(operational_day.cash_sales) > 0 ||
        Number(operational_day.card_sales) > 0 ||
        Number(operational_day.transfer_sales) > 0,
    };
  }

  const conversation_rows = [];
  for (const conversation of conversations.rows) {
    const last_message = await pool.query(
      "SELECT text_body FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1",
      [conversation.id],
    );
    conversation_rows.push({ ...conversation, last_message: last_message.rows[0]?.text_body ?? null });
  }

  // Capability-driven dashboard: only surface operational sections the account's
  // active bots actually declare (via their enabled operational actions). A
  // commercial account shows no ventas/compras/caja; an operational bot does.
  const enabled_actions = new Set(
    bots.rows.flatMap((bot) => (Array.isArray(bot.acciones_habilitadas_json) ? bot.acciones_habilitadas_json : [])),
  );
  const capabilities = {
    sales: enabled_actions.has("registrar_venta"),
    cash: enabled_actions.has("registrar_inicio_dia") || enabled_actions.has("registrar_cierre_dia"),
    close: enabled_actions.has("registrar_cierre_dia"),
    purchases: enabled_actions.has("registrar_compra"),
    inventory: enabled_actions.has("registrar_inventario"),
  };
  capabilities.operational = Object.values(capabilities).some(Boolean);

  return {
    account: account.rows[0] ?? null,
    bots: bots.rows,
    channels: channels.rows,
    conversations: conversation_rows,
    activity,
    stats: stats.rows[0] ?? {},
    capabilities,
    operational_day,
  };
}
