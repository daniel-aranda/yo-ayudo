// Bandeja admin de tareas internas (internal_tasks) a través de TODAS las cuentas.
// Las tareas las crea el bot con la interacción `crear_tarea` (p. ej. "necesito
// que me llame una persona") o la conversión de un guardrail event a tarea. Antes
// se escribían y nadie las veía; esta es la bandeja accionable de "qué tiene que
// hacer un humano" con su follow-up (estado pendiente → en progreso → hecha).

export const TASK_STATUSES = ["pendiente", "en_progreso", "hecha"];

const STATUS_LABELS = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  hecha: "Hecha",
};

// De dónde vino la tarea (metadata_json.source), para explicar el origen en la UI.
function task_origin(metadata_json) {
  const source = metadata_json?.source;
  if (source === "guardrail_event") return "Capability gap";
  if (source === "bot_engine_action") return "Interacción del bot";
  return "Tarea";
}

export function task_status_label(status) {
  return STATUS_LABELS[status] ?? status;
}

export async function get_tasks_admin_view(pool, input = {}) {
  const filters = [];
  const values = [];
  const add_filter = (sql, value) => {
    values.push(value);
    filters.push(sql.replace("?", `$${values.length}`));
  };

  const account_id = String(input.account_id ?? "").trim();
  const bot_id = String(input.bot_id ?? "").trim();
  const status = String(input.status ?? "").trim();
  const q = String(input.q ?? "").trim();

  if (account_id) add_filter("t.account_id = ?", account_id);
  if (bot_id) add_filter("t.bot_id = ?", bot_id);
  if (status) add_filter("t.status = ?", status);
  if (q) {
    values.push(`%${q.toLowerCase()}%`);
    const placeholder = `$${values.length}`;
    filters.push(
      `(lower(t.titulo) LIKE ${placeholder} OR lower(t.descripcion) LIKE ${placeholder} OR lower(contacts.display_name) LIKE ${placeholder} OR contacts.whatsapp_phone LIKE ${placeholder})`,
    );
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  values.push(200);

  const result = await pool.query(
    `
      SELECT
        t.id,
        t.titulo,
        t.descripcion,
        t.status,
        t.due_at,
        t.responsable_id,
        t.assigned_to,
        t.metadata_json,
        t.conversation_id,
        t.created_at,
        t.bot_id,
        t.account_id,
        bots.name AS bot_name,
        accounts.name AS account_name,
        organizations.name AS organization_name,
        contacts.display_name AS contact_name,
        contacts.whatsapp_phone AS contact_phone
      FROM internal_tasks t
      LEFT JOIN bots ON bots.id = t.bot_id
      LEFT JOIN accounts ON accounts.id = t.account_id
      LEFT JOIN organizations ON organizations.id = t.organization_id
      LEFT JOIN conversations ON conversations.id = t.conversation_id
      LEFT JOIN contacts ON contacts.id = conversations.contact_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  const tasks = result.rows.map((row) => ({
    ...row,
    status_label: task_status_label(row.status),
    origin: task_origin(row.metadata_json),
  }));

  // Pendiente/en progreso arriba; hechas al final (orden estable en JS, pg-mem-safe).
  const status_weight = (s) => (s === "hecha" ? 2 : s === "en_progreso" ? 1 : 0);
  tasks.sort((a, b) => status_weight(a.status) - status_weight(b.status));

  const [accounts, bots] = await Promise.all([
    pool.query("SELECT id, name FROM accounts ORDER BY name"),
    pool.query("SELECT id, name, account_id FROM bots ORDER BY name"),
  ]);

  return {
    tasks,
    rollup: {
      total: tasks.length,
      pendiente: tasks.filter((task) => task.status === "pendiente").length,
      en_progreso: tasks.filter((task) => task.status === "en_progreso").length,
      hecha: tasks.filter((task) => task.status === "hecha").length,
    },
    filters: { account_id, bot_id, status, q },
    options: {
      accounts: accounts.rows,
      bots: bots.rows,
      statuses: TASK_STATUSES,
    },
  };
}

// Cambia el estado (toggle de la bandeja) y deja registro en el historial para
// que se vea el follow-up. `actor` opcional (quién lo movió, si hay sesión).
export async function update_task_status(pool, { task_id, status, actor = null, account_id = null }) {
  if (!TASK_STATUSES.includes(status)) {
    return { error: "invalid_status", message: "Estado de tarea inválido." };
  }

  const task = (
    await pool.query("SELECT id, status, account_id FROM internal_tasks WHERE id = $1 LIMIT 1", [task_id])
  ).rows[0];
  if (!task || (account_id && task.account_id !== account_id)) {
    return { error: "task_not_found", message: "La tarea no existe." };
  }

  const actor_clean = String(actor ?? "").trim() || null;
  if (task.status !== status) {
    await pool.query(
      "INSERT INTO task_updates (task_id, actor, from_status, to_status) VALUES ($1, $2, $3, $4)",
      [task_id, actor_clean, task.status, status],
    );
  }

  const result = await pool.query(
    "UPDATE internal_tasks SET status = $2, assigned_to = COALESCE($3, assigned_to), updated_at = now() WHERE id = $1 RETURNING id, status",
    [task_id, status, actor_clean],
  );

  return { task: result.rows[0] };
}

// Agrega una actualización al historial (quién atendió + qué pasó), opcionalmente
// avanzando el estado. Es el corazón del seguimiento de una tarea.
export async function add_task_update(pool, { task_id, actor, note, status, account_id = null } = {}) {
  const task = (
    await pool.query("SELECT id, status, account_id FROM internal_tasks WHERE id = $1 LIMIT 1", [task_id])
  ).rows[0];
  if (!task || (account_id && task.account_id !== account_id)) {
    return { error: "task_not_found", message: "La tarea no existe." };
  }

  const actor_clean = String(actor ?? "").trim() || null;
  const note_clean = String(note ?? "").trim() || null;
  const next_status = TASK_STATUSES.includes(status) ? status : null;

  if (!note_clean && !next_status) {
    return { error: "empty_update", message: "Agrega una nota o cambia el estado." };
  }

  const to_status = next_status ?? task.status;
  await pool.query(
    "INSERT INTO task_updates (task_id, actor, note, from_status, to_status) VALUES ($1, $2, $3, $4, $5)",
    [task_id, actor_clean, note_clean, task.status, to_status],
  );
  await pool.query(
    "UPDATE internal_tasks SET status = $2, assigned_to = COALESCE($3, assigned_to), updated_at = now() WHERE id = $1",
    [task_id, to_status, actor_clean],
  );

  return { ok: true };
}

// Detalle de una tarea + su historial completo. `account_id` opcional scopea
// (devuelve null si la tarea no es de esa cuenta) para el módulo a nivel cuenta.
export async function get_task_detail(pool, task_id, options = {}) {
  const account_id = options.account_id ?? null;
  const result = await pool.query(
    `
      SELECT
        t.*,
        bots.name AS bot_name,
        accounts.name AS account_name,
        organizations.name AS organization_name,
        contacts.display_name AS contact_name,
        contacts.whatsapp_phone AS contact_phone
      FROM internal_tasks t
      LEFT JOIN bots ON bots.id = t.bot_id
      LEFT JOIN accounts ON accounts.id = t.account_id
      LEFT JOIN organizations ON organizations.id = t.organization_id
      LEFT JOIN conversations ON conversations.id = t.conversation_id
      LEFT JOIN contacts ON contacts.id = conversations.contact_id
      WHERE t.id = $1
      LIMIT 1
    `,
    [task_id],
  );
  const row = result.rows[0];
  if (!row || (account_id && row.account_id !== account_id)) {
    return null;
  }

  const updates = await pool.query(
    "SELECT actor, note, from_status, to_status, created_at FROM task_updates WHERE task_id = $1 ORDER BY created_at ASC",
    [task_id],
  );

  return {
    task: { ...row, status_label: task_status_label(row.status), origin: task_origin(row.metadata_json) },
    updates: updates.rows.map((update) => ({
      ...update,
      from_label: task_status_label(update.from_status),
      to_label: task_status_label(update.to_status),
      status_changed: update.from_status !== update.to_status,
    })),
    statuses: TASK_STATUSES,
  };
}

// Tareas de una conversación (para cerrar el loop en el visor del inspector).
export async function list_tasks_for_conversation(pool, conversation_id) {
  const result = await pool.query(
    `
      SELECT id, titulo, descripcion, status, due_at, created_at, metadata_json, assigned_to, message_id
      FROM internal_tasks
      WHERE conversation_id = $1
      ORDER BY created_at DESC
    `,
    [conversation_id],
  );

  return result.rows.map((row) => ({
    ...row,
    status_label: task_status_label(row.status),
    origin: task_origin(row.metadata_json),
  }));
}
