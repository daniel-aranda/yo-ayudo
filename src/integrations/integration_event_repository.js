import { logger } from "../shared/logger.js";

export async function record_integration_event(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO integration_events (
        integration_key, operation, status, latency_ms, detail,
        organization_id, account_id, bot_id, metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *
    `,
    [
      input.integration_key,
      input.operation,
      input.status,
      input.latency_ms ?? null,
      input.detail ?? null,
      input.organization_id ?? null,
      input.account_id ?? null,
      input.bot_id ?? null,
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );
  return result.rows[0];
}

// Recording an integration event must never break the integration call it
// observes. Swallows errors (e.g. table missing in a partial migration).
export async function safe_record_integration_event(pool, input) {
  try {
    if (!pool) {
      return null;
    }
    return await record_integration_event(pool, input);
  } catch (error) {
    logger.error({ err: error, integration_key: input?.integration_key }, "integration event record failed");
    return null;
  }
}

// Per-integration recent activity over a time window: success/failure counts +
// last event. Window is computed in JS to stay portable (no interval casts).
export async function get_integration_event_summary(pool, { since_hours = 24 } = {}) {
  const since = new Date(Date.now() - since_hours * 60 * 60 * 1000);
  const result = await pool.query(
    `
      SELECT
        integration_key,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END)::int AS success_count,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END)::int AS failure_count,
        SUM(CASE WHEN status = 'not_configured' THEN 1 ELSE 0 END)::int AS not_configured_count,
        COUNT(*)::int AS total_count,
        MAX(created_at) AS last_event_at
      FROM integration_events
      WHERE created_at >= $1
      GROUP BY integration_key
      ORDER BY integration_key
    `,
    [since],
  );

  const by_key = new Map();
  for (const row of result.rows) {
    by_key.set(row.integration_key, {
      integration_key: row.integration_key,
      success_count: row.success_count ?? 0,
      failure_count: row.failure_count ?? 0,
      not_configured_count: row.not_configured_count ?? 0,
      total_count: row.total_count ?? 0,
      last_event_at: row.last_event_at ?? null,
    });
  }
  return by_key;
}
