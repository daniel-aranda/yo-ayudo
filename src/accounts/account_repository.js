import { is_inherit } from "../ai/ai_config_scope.js";

export async function upsert_account(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO accounts (organization_id, name, slug, status)
      VALUES ($1, $2, $3, COALESCE($4, 'active'))
      ON CONFLICT (organization_id, slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id,
      input.name,
      input.slug,
      input.status ?? "active",
    ],
  );

  return result.rows[0];
}

export async function get_account_by_id(pool, account_id) {
  const result = await pool.query("SELECT * FROM accounts WHERE id = $1 LIMIT 1", [account_id]);
  return result.rows[0] ?? null;
}

// AI por cuenta: hace **merge** en settings_json.ai (read-modify-write, nunca
// sobreescribe el resto de settings_json). provider "inherit"/vacío borra la clave
// `ai` para que la cuenta herede del global. Devuelve el settings_json resultante.
export async function update_account_ai_config(pool, account_id, { provider, model = "" }) {
  const current = await pool.query("SELECT settings_json FROM accounts WHERE id = $1 LIMIT 1", [account_id]);
  if (!current.rows[0]) return null;
  const raw = current.rows[0].settings_json;
  const settings = raw && typeof raw === "object" ? { ...raw } : {};
  if (is_inherit(provider)) {
    delete settings.ai;
  } else {
    settings.ai = { provider, model };
  }
  const result = await pool.query(
    "UPDATE accounts SET settings_json = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING settings_json",
    [account_id, JSON.stringify(settings)],
  );
  return result.rows[0]?.settings_json ?? null;
}
