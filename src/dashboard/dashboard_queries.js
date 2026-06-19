import { get_action } from "../actions/action_registry.js";
import { present_conversation_summary } from "../inspector/inspector_presenter.js";
import { resolve_dashboard_range } from "./date_range.js";

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

  // El dashboard solo lista negocios activos; se avisa cuántos quedan ocultos
  // (paused/archived) para que la diferencia contra admin no parezca un bug.
  const hidden = await pool.query(
    "SELECT count(*)::int AS count FROM organizations WHERE status != 'active'",
  );

  return { businesses: business_rows, hidden_business_count: hidden.rows[0]?.count ?? 0 };
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
  registrar_inicio_dia: "Caja inicial del día",
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

// Clave de día (YYYY-MM-DD) de un operation_date que puede venir como Date
// (pg-mem / node-postgres) o como string. Si ya es YYYY-MM-DD se usa tal cual;
// si es Date se toman sus componentes LOCALES (el día calendario que el negocio
// vivió), no UTC. Así el rango se filtra por día real en cualquier entorno.
function operation_date_key(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Suma ventas (op_business_days.total_sales) y compras (op_purchases.total_cost)
// de los días dentro del rango [from_date, to_date]. El filtro por fecha es en
// JS (ver nota en el llamador): comparación de claves de día YYYY-MM-DD.
async function sum_operational_range(pool, account_id, range) {
  const days = await pool.query(
    "SELECT id, operation_date, total_sales FROM op_business_days WHERE account_id = $1",
    [account_id],
  );
  const in_range_day_ids = new Set();
  let sales_total = 0;
  for (const day of days.rows) {
    const key = operation_date_key(day.operation_date);
    if (key >= range.from_date && key <= range.to_date) {
      in_range_day_ids.add(day.id);
      sales_total += Number(day.total_sales) || 0;
    }
  }

  let purchases_total = 0;
  if (in_range_day_ids.size > 0) {
    const purchases = await pool.query(
      "SELECT business_day_id, total_cost FROM op_purchases WHERE account_id = $1",
      [account_id],
    );
    for (const purchase of purchases.rows) {
      if (in_range_day_ids.has(purchase.business_day_id)) {
        purchases_total += Number(purchase.total_cost) || 0;
      }
    }
  }

  return { sales_total, purchases_total };
}

export async function get_account_dashboard_data(pool, input) {
  // Rango de fechas: las métricas de actividad/ventas/compras lo respetan; bots y
  // canales (config, estado actual) NO. El día operativo (caja/desglose/cierre)
  // es de un solo día y solo se calcula cuando el rango es "Hoy".
  const range = input.range ?? resolve_dashboard_range({});
  // La cuenta basta: el negocio se deriva de ella (URL /dashboard/accounts/:id).
  const account = await pool.query(
    `
      SELECT
        accounts.*,
        organizations.name AS business_name,
        organizations.slug AS business_slug,
        organizations.status AS business_status
      FROM accounts
      JOIN organizations ON organizations.id = accounts.organization_id
      WHERE accounts.id = $1
      LIMIT 1
    `,
    [input.account_id],
  );
  const organization_id = account.rows[0]?.organization_id ?? null;
  // Incluye drafts (un bot recién creado desde este dashboard debe verse);
  // solo lo archivado queda fuera.
  const bots = await pool.query(
    `
      SELECT bots.*
      FROM bots
      WHERE bots.account_id = $1
        AND bots.status != 'archived'
      ORDER BY bots.bot_type, bots.name
    `,
    [input.account_id],
  );
  // Cuentas hermanas (mismo negocio) para el switcher del header: cambiar de
  // cuenta sin volver al dashboard del negocio.
  const sibling_accounts = await pool.query(
    "SELECT id, name FROM accounts WHERE organization_id = $1 AND status = 'active' ORDER BY name",
    [organization_id],
  );
  // Tareas abiertas (no hechas) de la cuenta, para la tarjeta del dashboard.
  const open_tasks = await pool.query(
    "SELECT count(*)::int AS count FROM internal_tasks WHERE account_id = $1 AND status <> 'hecha'",
    [input.account_id],
  );
  // Bots de sistema (mantenidos por la plataforma) disponibles como base para
  // crear un bot de esta cuenta clonando su definición.
  const system_bots = await pool.query(
    `
      SELECT id, name, description
      FROM bots
      WHERE bot_type = 'system'
        AND status = 'active'
      ORDER BY name
    `,
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
  // $1 account_id · $2 from_iso · $3 to_excl_iso (timestamps, semiabierto).
  // bots_count/channels_count quedan FUERA del rango (config, estado actual);
  // el resto de las cuentas (conversaciones, errores, prospectos, tareas) son
  // del rango vía created_at.
  const stats = await pool.query(
    `
      SELECT
        (SELECT count(*)::int FROM bots WHERE account_id = $1 AND status != 'archived') AS bots_count,
        (SELECT count(*)::int FROM whatsapp_phone_numbers WHERE account_id = $1 AND status = 'active') AS channels_count,
        (
          SELECT count(*)::int
          FROM conversations
          JOIN bots ON bots.id = conversations.bot_id
          WHERE bots.account_id = $1
            AND conversations.created_at >= $2 AND conversations.created_at < $3
        ) AS conversations_count,
        (
          SELECT count(*)::int
          FROM processing_events
          WHERE account_id = $1
            AND status = 'error'
            AND created_at >= $2 AND created_at < $3
        ) AS error_events_count,
        (
          SELECT count(*)::int
          FROM crm_clients
          WHERE account_id = $1
            AND created_at >= $2 AND created_at < $3
        ) AS prospects_count,
        (
          SELECT count(*)::int
          FROM internal_tasks
          WHERE account_id = $1
            AND created_at >= $2 AND created_at < $3
        ) AS tasks_count
    `,
    [input.account_id, range.from_iso, range.to_excl_iso],
  );

  // Ventas/compras acumuladas del rango. El filtro por operation_date (columna
  // date) se hace en JS, no en SQL: pg-mem normaliza la fecha a su parte UTC y
  // las comparaciones de cota superior con literales de fecha fallan; en JS
  // comparamos por clave de día (YYYY-MM-DD) y queda correcto en pg-mem y en
  // Postgres real. Una fila por día por cuenta: el conteo es trivial.
  const { sales_total, purchases_total } = await sum_operational_range(pool, input.account_id, range);
  stats.rows[0].sales_total = sales_total;
  stats.rows[0].purchases_total = purchases_total;

  // El detalle del día (caja inicial/final, desglose, compras, cierre) es de un
  // solo día: solo se calcula en "Hoy". En rangos multi-día, los totales sumados
  // de ventas/compras ya viven en stats; aquí queda null.
  const business_day_result = range.is_today
    ? await pool.query(
        `
          SELECT *
          FROM op_business_days
          WHERE account_id = $1
          ORDER BY operation_date DESC, updated_at DESC
          LIMIT 1
        `,
        [input.account_id],
      )
    : { rows: [] };
  let operational_day = business_day_result.rows[0] ?? null;
  // El detalle de "Hoy" solo aplica si el último día operativo ES hoy. Si el más
  // reciente es de otra fecha, hoy no hubo operación: mostramos el estado vacío
  // (consistente con las métricas en $0) en vez de rotular "Hoy · 9 jun 2026".
  if (operational_day && operation_date_key(operational_day.operation_date) !== range.to_date) {
    operational_day = null;
  }
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

  // Enriquece cada conversación igual que el inspector (get_bot_conversations):
  // último mensaje + interacciones ejecutadas (chips) + summary, para que el
  // panel del dashboard y el del bot se vean idénticos (mismo componente).
  const conversation_rows = [];
  for (const conversation of conversations.rows) {
    const [last_message, executed_actions] = await Promise.all([
      pool.query(
        "SELECT text_body, parsed_intent FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1",
        [conversation.id],
      ),
      pool.query(
        `
          SELECT action_id, max(created_at) AS last_at
          FROM action_audit_logs
          WHERE conversation_id = $1 AND status = 'executed'
          GROUP BY action_id
          ORDER BY last_at DESC
        `,
        [conversation.id],
      ),
    ]);
    const enriched = {
      ...conversation,
      last_message: last_message.rows[0]?.text_body ?? null,
      last_intent: last_message.rows[0]?.parsed_intent ?? null,
      interactions: executed_actions.rows.map((row) => ({
        action_id: row.action_id,
        label: get_action(row.action_id)?.nombre ?? row.action_id,
      })),
    };
    enriched.summary = present_conversation_summary(enriched);
    conversation_rows.push(enriched);
  }

  // Capability-driven dashboard: only surface operational sections the account's
  // ACTIVE bots actually declare (via their enabled operational actions) — a
  // draft (p. ej. recién clonado de un bot de sistema) no prende paneles. A
  // commercial account shows no ventas/compras/caja; an operational bot does.
  const enabled_actions = new Set(
    bots.rows
      .filter((bot) => bot.status === "active")
      .flatMap((bot) => (Array.isArray(bot.acciones_habilitadas_json) ? bot.acciones_habilitadas_json : [])),
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
    sibling_accounts: sibling_accounts.rows,
    open_tasks_count: open_tasks.rows[0]?.count ?? 0,
    bots: bots.rows,
    system_bots: system_bots.rows,
    channels: channels.rows,
    conversations: conversation_rows,
    activity,
    stats: stats.rows[0] ?? {},
    capabilities,
    operational_day,
    range,
  };
}
