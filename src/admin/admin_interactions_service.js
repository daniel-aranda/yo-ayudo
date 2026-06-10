import { available_agent_interactions } from "../inspector/inspector_repository.js";
import { get_action } from "../actions/action_registry.js";
import { get_integration_event_summary } from "../integrations/integration_event_repository.js";
import { integration_definitions } from "../integrations/integration_registry.js";

// Action execution statuses that count as an error (vs `executed` = success and
// `pending_confirmation` = pending).
const ACTION_ERROR_STATUSES = ["failed", "blocked", "not_implemented", "pending_provider", "unknown_action"];

// Which external integrations each executable interaction can hit, for the catalog hint.
const PROVIDER_BY_ACTION = {
  buscar_negocios: "Google Places + proveedores de prospección",
  responder_con_voz: "ElevenLabs + WhatsApp",
};

async function get_action_stats(pool, since) {
  const result = await pool.query(
    `
      SELECT
        action_id,
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END)::int AS success,
        SUM(CASE WHEN status IN ('failed', 'blocked', 'not_implemented', 'pending_provider', 'unknown_action') THEN 1 ELSE 0 END)::int AS error,
        SUM(CASE WHEN status = 'pending_confirmation' THEN 1 ELSE 0 END)::int AS pending,
        MAX(created_at) AS last_at
      FROM action_audit_logs
      WHERE created_at >= $1
      GROUP BY action_id
    `,
    [since],
  );
  const by_action = new Map();
  for (const row of result.rows) {
    by_action.set(row.action_id, row);
  }
  return by_action;
}

async function get_ai_call_stats(pool, since) {
  const result = await pool.query(
    `
      SELECT
        provider,
        COUNT(*)::int AS total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::int AS success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)::int AS error,
        AVG(latency_ms) AS avg_latency_ms,
        MAX(created_at) AS last_at
      FROM ai_calls
      WHERE created_at >= $1
      GROUP BY provider
    `,
    [since],
  );
  return result.rows;
}

// Merge the last activity across the three logging streams (action executions,
// integration/provider calls, AI calls) into one time-sorted feed.
async function get_recent_activity(pool, limit) {
  const [actions, integrations, ai] = await Promise.all([
    pool.query(
      `SELECT a.action_id, a.status, a.error, a.created_at, b.name AS bot_name
       FROM action_audit_logs a
       LEFT JOIN bots b ON b.id = a.bot_id
       ORDER BY a.created_at DESC LIMIT $1`,
      [limit],
    ),
    pool.query(
      `SELECT integration_key, operation, status, detail, latency_ms, created_at
       FROM integration_events ORDER BY created_at DESC LIMIT $1`,
      [limit],
    ),
    pool.query(
      `SELECT provider, function_name, status, latency_ms, error_message, created_at
       FROM ai_calls ORDER BY created_at DESC LIMIT $1`,
      [limit],
    ),
  ]);

  const rows = [];
  for (const row of actions.rows) {
    rows.push({
      kind: "Interacción",
      label: row.action_id,
      sublabel: row.bot_name || "—",
      status_class: row.status === "executed" ? "ok" : ACTION_ERROR_STATUSES.includes(row.status) ? "error" : "pending",
      status_text: row.status,
      detail: row.error || null,
      created_at: row.created_at,
    });
  }
  for (const row of integrations.rows) {
    rows.push({
      kind: "Proveedor",
      label: row.integration_key,
      sublabel: row.operation,
      status_class: row.status === "success" ? "ok" : row.status === "failure" ? "error" : "pending",
      status_text: row.status,
      detail: row.detail || (row.latency_ms != null ? `${row.latency_ms} ms` : null),
      created_at: row.created_at,
    });
  }
  for (const row of ai.rows) {
    rows.push({
      kind: "AI",
      label: `${row.provider} · ${row.function_name}`,
      sublabel: row.latency_ms != null ? `${row.latency_ms} ms` : "—",
      status_class: row.status === "completed" ? "ok" : "error",
      status_text: row.status,
      detail: row.error_message || null,
      created_at: row.created_at,
    });
  }
  rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return rows.slice(0, limit);
}

// Interaction-centric observability admin: the catalog of agent interactions
// plus the success/error counts of every external API call (AI + providers)
// they drive, and a recent-activity feed across all three logging streams.
export async function get_interactions_admin_view(pool, { since_hours = 168 } = {}) {
  const since = new Date(Date.now() - since_hours * 60 * 60 * 1000);
  const [action_stats, ai_stats, integration_summary, recent] = await Promise.all([
    get_action_stats(pool, since),
    get_ai_call_stats(pool, since),
    get_integration_event_summary(pool, { since_hours }),
    get_recent_activity(pool, 20),
  ]);

  const interactions = available_agent_interactions.map((interaction) => {
    const action = interaction.action_id ? get_action(interaction.action_id) : null;
    const stats = interaction.action_id ? action_stats.get(interaction.action_id) : null;
    return {
      type: interaction.type,
      label: interaction.label,
      description: interaction.description,
      action_id: interaction.action_id ?? null,
      executable: Boolean(interaction.action_id),
      categoria: action?.categoria ?? null,
      nivel_riesgo: action?.nivel_riesgo ?? null,
      // A real handler is wired (vs a `stub_*` roadmap placeholder).
      handler_real: action ? Boolean(action.handler && !String(action.handler).startsWith("stub_")) : false,
      provider: interaction.action_id ? PROVIDER_BY_ACTION[interaction.action_id] ?? null : null,
      total: stats?.total ?? 0,
      success: stats?.success ?? 0,
      error: stats?.error ?? 0,
      pending: stats?.pending ?? 0,
      last_at: stats?.last_at ?? null,
    };
  });

  const external = [];
  for (const row of ai_stats) {
    external.push({
      key: row.provider,
      label: `AI · ${row.provider}`,
      group: "ai",
      total: row.total ?? 0,
      success: row.success ?? 0,
      error: row.error ?? 0,
      not_configured: 0,
      avg_latency_ms: row.avg_latency_ms != null ? Math.round(Number(row.avg_latency_ms)) : null,
      last_at: row.last_at ?? null,
    });
  }
  const integration_label_by_key = new Map(integration_definitions.map((definition) => [definition.key, definition.label]));
  for (const [key, events] of integration_summary.entries()) {
    external.push({
      key,
      label: integration_label_by_key.get(key) ?? key,
      group: "provider",
      total: events.total_count ?? 0,
      success: events.success_count ?? 0,
      error: events.failure_count ?? 0,
      not_configured: events.not_configured_count ?? 0,
      avg_latency_ms: null,
      last_at: events.last_event_at ?? null,
    });
  }
  external.sort((a, b) => b.total - a.total);

  const totals = {
    interactions_count: interactions.length,
    executable_count: interactions.filter((interaction) => interaction.executable).length,
    interactions_success: interactions.reduce((sum, interaction) => sum + interaction.success, 0),
    interactions_error: interactions.reduce((sum, interaction) => sum + interaction.error, 0),
    external_total: external.reduce((sum, item) => sum + item.total, 0),
    external_error: external.reduce((sum, item) => sum + item.error, 0),
  };

  return { interactions, external, recent, totals, since_hours };
}
