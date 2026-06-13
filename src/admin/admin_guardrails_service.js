// Vista interna de guardrail events / capability gaps. Es la contraparte de
// observabilidad de lo que audita el Action Executor: qué intentó el bot que no
// pudo ejecutar (capacidad faltante, no habilitada, sin proveedor, riesgo, etc.)
// y, como backlog de producto, qué acciones piden más los negocios.
const KNOWN_TIPOS = [
  "accion_no_disponible",
  "accion_no_habilitada",
  "interaccion_deshabilitada",
  "requiere_confirmacion",
  "riesgo_bloqueado",
  "proveedor_no_configurado",
  "input_invalido",
  "permiso_insuficiente",
];

function count_by(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export async function get_guardrails_admin_view(pool, input = {}) {
  const filters = [];
  const values = [];
  const add_filter = (sql, value) => {
    values.push(value);
    filters.push(sql.replace("?", `$${values.length}`));
  };

  const account_id = String(input.account_id ?? "").trim();
  const bot_id = String(input.bot_id ?? "").trim();
  const tipo = String(input.tipo ?? "").trim();
  const action_id = String(input.action_id ?? "").trim();
  const status = String(input.status ?? "").trim();

  if (account_id) add_filter("g.account_id = ?", account_id);
  if (bot_id) add_filter("g.bot_id = ?", bot_id);
  if (tipo) add_filter("g.tipo = ?", tipo);
  if (action_id) add_filter("g.action_id = ?", action_id);
  if (status) add_filter("g.status = ?", status);

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  // Cap de seguridad: el rollup se calcula sobre este set. En dev el volumen es
  // bajo; si crece, conviene mover el rollup a GROUP BY en SQL.
  values.push(500);

  const result = await pool.query(
    `
      SELECT
        g.*,
        bots.name AS bot_name,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM bot_guardrail_events g
      LEFT JOIN bots ON bots.id = g.bot_id
      LEFT JOIN accounts ON accounts.id = g.account_id
      LEFT JOIN organizations ON organizations.id = g.organization_id
      ${where}
      ORDER BY g.created_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const events = result.rows;
  const tipos_present = count_by(events, "tipo").map((entry) => entry.value);

  const [accounts, bots, actions] = await Promise.all([
    pool.query("SELECT id, name FROM accounts ORDER BY name"),
    pool.query("SELECT id, name, account_id FROM bots ORDER BY name"),
    pool.query("SELECT DISTINCT action_id FROM bot_guardrail_events WHERE action_id IS NOT NULL ORDER BY action_id"),
  ]);

  return {
    events,
    rollup: {
      total: events.length,
      total_new: events.filter((event) => event.status === "nuevo").length,
      by_tipo: count_by(events, "tipo"),
      // Capability gaps: qué acciones se intentaron pero no se pudieron ejecutar.
      by_action: count_by(events, "action_id"),
    },
    filters: { account_id, bot_id, tipo, action_id, status },
    options: {
      accounts: accounts.rows,
      bots: bots.rows,
      actions: actions.rows.map((row) => row.action_id),
      // Tipos conocidos + cualquiera presente que no esté en la lista canónica.
      tipos: [...new Set([...KNOWN_TIPOS, ...tipos_present])],
    },
  };
}
