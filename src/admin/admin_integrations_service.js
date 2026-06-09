import { run_integration_checks } from "../integrations/integration_registry.js";
import { get_integration_event_summary } from "../integrations/integration_event_repository.js";

// Builds the admin integrations view: live connect+operate checks merged with
// recent operational event counts (positive/negative) per integration.
export async function get_integrations_admin_view(pool, options = {}) {
  const since_hours = options.since_hours ?? 24;
  const [checks, summary] = await Promise.all([
    run_integration_checks({ pool, fetcher: options.fetcher, s3_probe: options.s3_probe }),
    get_integration_event_summary(pool, { since_hours }),
  ]);

  const empty_events = { success_count: 0, failure_count: 0, not_configured_count: 0, total_count: 0, last_event_at: null };

  const integrations = checks.map((check) => ({
    ...check,
    events: summary.get(check.key) ?? { ...empty_events },
  }));

  // Event keys that have no health-check definition (e.g. yelp_fusion, serpapi
  // prospecting providers) still deserve a row from their recent activity.
  const known = new Set(checks.map((check) => check.key));
  const extra = [...summary.entries()]
    .filter(([key]) => !known.has(key))
    .map(([key, events]) => ({
      key,
      label: key,
      group: "other",
      configured: null,
      status: "unknown",
      detail: "Sin check de salud; solo actividad.",
      latency_ms: null,
      events,
    }));

  const all = [...integrations, ...extra];

  const totals = all.reduce(
    (acc, item) => {
      acc.success += item.events.success_count ?? 0;
      acc.failure += item.events.failure_count ?? 0;
      acc.not_configured += item.events.not_configured_count ?? 0;
      return acc;
    },
    { success: 0, failure: 0, not_configured: 0 },
  );

  const health = {
    ok: integrations.filter((item) => item.status === "ok").length,
    error: integrations.filter((item) => item.status === "error").length,
    not_configured: integrations.filter((item) => item.status === "not_configured").length,
  };

  return { integrations: all, totals, health, since_hours };
}
