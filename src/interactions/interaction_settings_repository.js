import { logger } from "../shared/logger.js";

// System-level interaction settings (enable/disable + provider config), keyed by
// interaction `type`. Interactions with no row default to enabled with no config.
export async function get_interaction_settings_map(pool) {
  const map = new Map();
  if (!pool) {
    return map;
  }
  try {
    const result = await pool.query(
      "SELECT type, action_id, enabled, config_json, updated_at FROM interaction_settings",
    );
    for (const row of result.rows) {
      map.set(row.type, row);
    }
  } catch (error) {
    logger.error({ err: error }, "interaction settings read failed");
  }
  return map;
}

export async function upsert_interaction_setting(pool, { type, action_id = null, enabled = true, config_json = {} }) {
  const result = await pool.query(
    `
      INSERT INTO interaction_settings (type, action_id, enabled, config_json, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, now())
      ON CONFLICT (type) DO UPDATE SET
        action_id = EXCLUDED.action_id,
        enabled = EXCLUDED.enabled,
        config_json = EXCLUDED.config_json,
        updated_at = now()
      RETURNING *
    `,
    [type, action_id, enabled, JSON.stringify(config_json ?? {})],
  );
  return result.rows[0];
}

// For the action executor: the runtime setting for the interaction that owns this
// action, or null when there's no row (defaults: enabled, no config). Never throws
// — a missing table (partial migration) must not break action execution.
export async function get_action_runtime_setting(pool, action_id) {
  if (!pool || !action_id) {
    return null;
  }
  try {
    const result = await pool.query(
      "SELECT enabled, config_json FROM interaction_settings WHERE action_id = $1 LIMIT 1",
      [action_id],
    );
    return result.rows[0] ?? null;
  } catch (error) {
    logger.error({ err: error, action_id }, "interaction runtime setting read failed");
    return null;
  }
}
