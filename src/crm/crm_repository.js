// CRM identity model. A crm_clients row has a STABLE internal id and several
// business identifiers (curp, phone, instagram, email). The business key is
// DERIVED by priority (CURP > phone > instagram > email > internal id) and stored
// denormalized in client_key/client_key_type so it can "mutate" (upgrade) as a
// higher-priority identifier arrives, while the id never changes.
//
// Dedup/identity resolution happens here in JS (pg-mem-safe): on save we look for
// an existing client in the same account matching ANY provided identifier, then
// merge — so the same person reached via different channels resolves to one record.

import { rank_between } from "./lexorank.js";

// Order matters: this is the key-priority list AND the identifier match order.
export const CLIENT_KEY_PRIORITY = ["curp", "phone", "instagram", "email"];

// Orden efectivo de una columna del tablero: por `pipeline_rank` ascendente; las
// filas sin rank (aún no reordenadas) van al final, más nuevas primero. Mismo
// criterio en SQL (backfill) y en JS (vista) para que el reorder sea consistente.
function compare_pipeline_rank(a, b) {
  const ra = a.pipeline_rank;
  const rb = b.pipeline_rank;
  if (ra && rb) return ra < rb ? -1 : ra > rb ? 1 : 0;
  if (ra && !rb) return -1;
  if (!ra && rb) return 1;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function clean(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalize_curp(value) {
  const text = clean(value);
  return text ? text.toUpperCase().replace(/\s+/g, "") : null;
}

function normalize_phone(value) {
  const text = clean(value);
  if (!text) {
    return null;
  }
  const digits = text.replace(/[^\d]/g, "");
  return digits || null;
}

function normalize_instagram(value) {
  const text = clean(value);
  return text ? text.replace(/^@+/, "").toLowerCase() : null;
}

function normalize_email(value) {
  const text = clean(value);
  return text ? text.toLowerCase() : null;
}

// Accept both the Spanish action input keys and the English column names.
export function normalize_identifiers(input = {}) {
  return {
    curp: normalize_curp(input.curp),
    phone: normalize_phone(input.phone ?? input.telefono ?? input.numero ?? input.tel),
    instagram: normalize_instagram(input.instagram ?? input.instagram_id ?? input.ig),
    email: normalize_email(input.email ?? input.correo),
  };
}

// The derived business key: best available identifier, by priority. Falls back to
// the internal id ("internal") when no external identifier is known yet.
export function derive_client_key(record = {}) {
  for (const type of CLIENT_KEY_PRIORITY) {
    const value = clean(record[type]);
    if (value) {
      return { client_key: value, client_key_type: type };
    }
  }
  return { client_key: record.id ? String(record.id) : null, client_key_type: "internal" };
}

async function find_existing_client(pool, { account_id, id, identifiers }) {
  const clauses = [];
  const values = [account_id];

  if (id) {
    values.push(id);
    clauses.push(`id = $${values.length}`);
  }
  for (const type of CLIENT_KEY_PRIORITY) {
    if (identifiers[type]) {
      values.push(identifiers[type]);
      clauses.push(`${type} = $${values.length}`);
    }
  }

  if (!clauses.length) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM crm_clients
      WHERE account_id = $1 AND (${clauses.join(" OR ")})
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    values,
  );

  return result.rows[0] ?? null;
}

// Create OR update a prospect/client by identity resolution. Re-saving with a new
// identifier merges into the same record and can UPGRADE the client_key (the
// "mutating" key the product needs). Only provided fields overwrite; unknown ones
// keep their previous value.
export async function upsert_crm_client(pool, input) {
  const account_id = input.account_id ?? null;
  const identifiers = normalize_identifiers(input);
  const explicit_id = clean(input.id ?? input.cliente_id ?? input.client_id ?? input.contacto_id);
  const existing = await find_existing_client(pool, { account_id, id: explicit_id, identifiers });

  const merged = {
    curp: identifiers.curp ?? existing?.curp ?? null,
    phone: identifiers.phone ?? existing?.phone ?? null,
    instagram: identifiers.instagram ?? existing?.instagram ?? null,
    email: identifiers.email ?? existing?.email ?? null,
  };
  const display_name = clean(input.display_name ?? input.nombre ?? input.name) ?? existing?.display_name ?? null;
  const kind = clean(input.kind ?? input.tipo) ?? existing?.kind ?? "prospecto";
  const pipeline_status =
    clean(input.pipeline_status ?? input.status ?? input.estatus ?? input.etapa) ?? existing?.pipeline_status ?? "nuevo";
  const source = clean(input.source ?? input.fuente ?? input.canal) ?? existing?.source ?? null;
  const need = clean(input.need ?? input.necesidad ?? input.interes) ?? existing?.need ?? null;
  const notes = clean(input.notes ?? input.nota ?? input.notas ?? input.free_comment) ?? existing?.notes ?? null;
  const assigned_to = clean(input.assigned_to ?? input.responsable) ?? existing?.assigned_to ?? null;

  if (existing) {
    const { client_key, client_key_type } = derive_client_key({ ...merged, id: existing.id });
    const result = await pool.query(
      `
        UPDATE crm_clients SET
          organization_id = COALESCE($2, organization_id),
          contact_id = COALESCE($3, contact_id),
          bot_id = COALESCE($4, bot_id),
          conversation_id = COALESCE($5, conversation_id),
          display_name = $6,
          curp = $7,
          phone = $8,
          instagram = $9,
          email = $10,
          client_key = $11,
          client_key_type = $12,
          kind = $13,
          pipeline_status = $14,
          source = $15,
          need = $16,
          notes = $17,
          assigned_to = $18,
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [
        existing.id,
        input.organization_id ?? null,
        input.contact_id ?? null,
        input.bot_id ?? null,
        input.conversation_id ?? null,
        display_name,
        merged.curp,
        merged.phone,
        merged.instagram,
        merged.email,
        client_key,
        client_key_type,
        kind,
        pipeline_status,
        source,
        need,
        notes,
        assigned_to,
      ],
    );

    return { ...result.rows[0], created: false };
  }

  // New record: insert first (no id yet), then backfill the internal-key fallback
  // if there is no external identifier, so client_key is never null.
  const initial_key = derive_client_key(merged);
  const inserted = await pool.query(
    `
      INSERT INTO crm_clients (
        organization_id,
        account_id,
        contact_id,
        bot_id,
        conversation_id,
        display_name,
        curp,
        phone,
        instagram,
        email,
        client_key,
        client_key_type,
        kind,
        pipeline_status,
        source,
        need,
        notes,
        assigned_to,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb)
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      account_id,
      input.contact_id ?? null,
      input.bot_id ?? null,
      input.conversation_id ?? null,
      display_name,
      merged.curp,
      merged.phone,
      merged.instagram,
      merged.email,
      initial_key.client_key,
      initial_key.client_key_type,
      kind,
      pipeline_status,
      source,
      need,
      notes,
      assigned_to,
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  let row = inserted.rows[0];
  if (!row.client_key) {
    const fixed = await pool.query(
      "UPDATE crm_clients SET client_key = $2, client_key_type = 'internal' WHERE id = $1 RETURNING *",
      [row.id, String(row.id)],
    );
    row = fixed.rows[0];
  }

  return { ...row, created: true };
}

// Mueve un prospecto/cliente a una etapa BASE (drop en el tablero o select del
// detalle). Solo acepta etapas base como destino; las custom se setean por el bot.
// Mover de etapa SIN posición (el select accesible del detalle): cambia la columna
// y deja la tarjeta AL FINAL de la columna destino (rank después del último).
export async function update_crm_client_stage(pool, { client_id, account_id, stage }) {
  const target = String(stage ?? "").trim();
  if (!CRM_BASE_KEYS.has(target)) {
    return { error: "invalid_stage", message: "Etapa inválida." };
  }
  const append_rank = rank_between(await max_rank_in_column(pool, account_id, target, client_id), "");
  const result = await pool.query(
    "UPDATE crm_clients SET pipeline_status = $3, pipeline_rank = $4, updated_at = now() WHERE id = $1 AND account_id = $2 RETURNING id, pipeline_status, pipeline_rank",
    [client_id, account_id, target, append_rank],
  );
  if (!result.rows[0]) {
    return { error: "not_found", message: "Prospecto no encontrado." };
  }
  return { ok: true, client: result.rows[0] };
}

// Rank más alto (último) de una columna, o '' si no hay ninguno con rank.
async function max_rank_in_column(pool, account_id, stage, exclude_id) {
  const result = await pool.query(
    `SELECT pipeline_rank FROM crm_clients
     WHERE account_id = $1 AND pipeline_status = $2 AND pipeline_rank IS NOT NULL AND id <> $3
     ORDER BY pipeline_rank DESC LIMIT 1`,
    [account_id, stage, exclude_id ?? "00000000-0000-0000-0000-000000000000"],
  );
  return result.rows[0]?.pipeline_rank ?? "";
}

// Ranks de los dos vecinos del hueco donde cae la tarjeta (deben estar en la misma
// cuenta + etapa destino). Devuelve null para un vecino ausente o sin rank.
async function resolve_neighbor_ranks(pool, account_id, stage, before_id, after_id) {
  const result = await pool.query(
    `SELECT id, pipeline_rank FROM crm_clients
     WHERE account_id = $1 AND pipeline_status = $2 AND (id = $3 OR id = $4)`,
    [account_id, stage, before_id ?? null, after_id ?? null],
  );
  const by_id = new Map(result.rows.map((row) => [row.id, row.pipeline_rank]));
  return {
    before_rank: before_id ? by_id.get(before_id) ?? null : null,
    after_rank: after_id ? by_id.get(after_id) ?? null : null,
  };
}

// Materializa ranks de toda una columna en su orden actual (excepto la tarjeta que
// se está moviendo). Se llama solo cuando un vecino aún no tiene rank — una vez por
// columna; después todos tienen rank y el reorder solo toca la tarjeta movida.
async function backfill_column_ranks(pool, account_id, stage, exclude_id) {
  const result = await pool.query(
    `SELECT id FROM crm_clients
     WHERE account_id = $1 AND pipeline_status = $2 AND id <> $3
     ORDER BY COALESCE(pipeline_rank, '~') ASC, created_at DESC, id ASC`,
    [account_id, stage, exclude_id ?? "00000000-0000-0000-0000-000000000000"],
  );
  let prev = "";
  for (const row of result.rows) {
    prev = rank_between(prev, "");
    await pool.query("UPDATE crm_clients SET pipeline_rank = $2 WHERE id = $1", [row.id, prev]);
  }
}

// Mover una tarjeta a una posición: cambia la etapa (columna) y le asigna un rank
// ENTRE sus dos vecinos (`before_id` arriba, `after_id` abajo). Si un vecino aún no
// tiene rank, primero materializa la columna y reintenta.
export async function move_crm_client(pool, { client_id, account_id, stage, before_id, after_id }) {
  const target = String(stage ?? "").trim();
  if (!CRM_BASE_KEYS.has(target)) {
    return { error: "invalid_stage", message: "Etapa inválida." };
  }
  const exists = await pool.query("SELECT id FROM crm_clients WHERE id = $1 AND account_id = $2 LIMIT 1", [client_id, account_id]);
  if (!exists.rows[0]) {
    return { error: "not_found", message: "Prospecto no encontrado." };
  }

  const before = before_id && before_id !== client_id ? before_id : null;
  const after = after_id && after_id !== client_id ? after_id : null;

  let { before_rank, after_rank } = await resolve_neighbor_ranks(pool, account_id, target, before, after);
  // Algún vecino sin rank → materializa la columna y reintenta una vez.
  if ((before && before_rank == null) || (after && after_rank == null)) {
    await backfill_column_ranks(pool, account_id, target, client_id);
    ({ before_rank, after_rank } = await resolve_neighbor_ranks(pool, account_id, target, before, after));
  }

  const new_rank = rank_between(before_rank ?? "", after_rank ?? "");
  const result = await pool.query(
    "UPDATE crm_clients SET pipeline_status = $3, pipeline_rank = $4, updated_at = now() WHERE id = $1 AND account_id = $2 RETURNING id, pipeline_status, pipeline_rank",
    [client_id, account_id, target, new_rank],
  );
  return { ok: true, client: result.rows[0] };
}

export async function get_crm_client(pool, id) {
  const result = await pool.query("SELECT * FROM crm_clients WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ?? null;
}

// Detail for the "Ver prospecto" popup: the client plus the names needed for the
// header/meta and the link back to its conversation.
export async function get_crm_client_detail(pool, id) {
  const result = await pool.query(
    `
      SELECT
        c.*,
        a.name AS account_name,
        o.name AS organization_name,
        b.name AS bot_name
      FROM crm_clients c
      LEFT JOIN accounts a ON a.id = c.account_id
      LEFT JOIN organizations o ON o.id = c.organization_id
      LEFT JOIN bots b ON b.id = c.bot_id
      WHERE c.id = $1
      LIMIT 1
    `,
    [id],
  );
  return result.rows[0] ?? null;
}

// Clients captured in one conversation — powers the "Valor capturado" panel.
export async function list_crm_clients_for_conversation(pool, conversation_id) {
  const result = await pool.query(
    `
      SELECT id, display_name, kind, pipeline_status, client_key, client_key_type, curp, phone, instagram, email, updated_at
      FROM crm_clients
      WHERE conversation_id = $1
      ORDER BY updated_at DESC
    `,
    [conversation_id],
  );
  return result.rows;
}

export async function list_crm_clients_for_account(pool, account_id, { limit = 100 } = {}) {
  const result = await pool.query(
    `
      SELECT *
      FROM crm_clients
      WHERE account_id = $1
      ORDER BY updated_at DESC
      LIMIT $2
    `,
    [account_id, limit],
  );
  return result.rows;
}

// Etapas BASE del pipeline (4, simplistas). Cada cliente guarda su etapa en
// `pipeline_status`. Cualquier valor que NO sea una etapa base se trata como una
// **categoría custom** que vive DENTRO de "Interesado" (no como columna aparte):
// la columna Interesado muestra un dropdown para filtrarlas. Las custom se derivan
// de los datos (los valores de `pipeline_status` no-base presentes en la cuenta);
// agregar/ocultar etapas con UI persistente por cuenta es el siguiente paso.
export const CRM_BASE_STAGES = [
  { key: "nuevo", label: "Nuevo" },
  { key: "interesado", label: "Interesado" },
  { key: "ganado", label: "Ganado" },
  { key: "perdido", label: "Perdido" },
];

// Valores legacy/sinónimos → etapa base, para que datos viejos caigan en su columna.
const CRM_STAGE_ALIASES = {
  cerrado_ganado: "ganado",
  cerrado_perdido: "perdido",
  closed_won: "ganado",
  closed_lost: "perdido",
  nuevo_prospecto: "nuevo",
};
const CRM_BASE_KEYS = new Set(CRM_BASE_STAGES.map((stage) => stage.key));

function humanize_stage(key) {
  const text = String(key ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Sin etapa";
}

// Vista CRM por cuenta: prospectos/clientes en columnas por etapa base. Las
// categorías custom se pliegan bajo "Interesado" (con `custom_categories` para su
// dropdown). Las columnas base vacías se muestran para leer el pipeline completo.
export async function get_account_crm_view(pool, account_id) {
  const account_row = await pool.query(
    `
      SELECT accounts.id, accounts.name AS account_name, accounts.organization_id, organizations.name AS organization_name
      FROM accounts
      JOIN organizations ON organizations.id = accounts.organization_id
      WHERE accounts.id = $1
      LIMIT 1
    `,
    [account_id],
  );
  const account = account_row.rows[0] ?? null;
  if (!account) {
    return { account: null, columns: [], totals: { total: 0, prospectos: 0, clientes: 0 } };
  }

  const clients = await list_crm_clients_for_account(pool, account_id, { limit: 500 });
  const columns = new Map(CRM_BASE_STAGES.map((stage) => [stage.key, { ...stage, clients: [] }]));
  const custom_by_key = new Map();

  for (const client of clients) {
    const raw = String(client.pipeline_status || "nuevo");
    const resolved = CRM_STAGE_ALIASES[raw] ?? raw;
    if (CRM_BASE_KEYS.has(resolved)) {
      columns.get(resolved).clients.push({ ...client, sub_category: null, sub_category_label: null });
    } else {
      // Categoría custom → entra a Interesado como sub-categoría filtrable.
      const label = humanize_stage(raw);
      columns.get("interesado").clients.push({ ...client, sub_category: raw, sub_category_label: label });
      if (!custom_by_key.has(raw)) {
        custom_by_key.set(raw, { key: raw, label, count: 0 });
      }
      custom_by_key.get(raw).count += 1;
    }
  }

  // El dropdown de Interesado solo aplica si la cuenta tiene categorías custom.
  columns.get("interesado").custom_categories = [...custom_by_key.values()].sort((a, b) => a.label.localeCompare(b.label));

  // Orden manual del tablero: cada columna por `pipeline_rank` (drag & drop).
  for (const column of columns.values()) {
    column.clients.sort(compare_pipeline_rank);
  }

  return {
    account,
    columns: CRM_BASE_STAGES.map((stage) => columns.get(stage.key)),
    totals: {
      total: clients.length,
      prospectos: clients.filter((client) => client.kind !== "cliente").length,
      clientes: clients.filter((client) => client.kind === "cliente").length,
    },
  };
}
