import { config as default_config } from "../app/config.js";

// Status vocabulary for a live check:
//   ok             -> configured AND we can connect + operate
//   error          -> configured but the probe failed (bad key, down, timeout)
//   not_configured -> credentials/target not set (off by design, not an error)
export const INTEGRATION_STATUS = Object.freeze({
  ok: "ok",
  error: "error",
  not_configured: "not_configured",
});

function ok(detail, latency_ms) {
  return { status: INTEGRATION_STATUS.ok, detail: detail ?? null, latency_ms: latency_ms ?? null };
}
function error(detail, latency_ms) {
  return { status: INTEGRATION_STATUS.error, detail: detail ?? null, latency_ms: latency_ms ?? null };
}
function not_configured(detail) {
  return { status: INTEGRATION_STATUS.not_configured, detail: detail ?? null, latency_ms: null };
}

// HTTP probe with a hard timeout so a hung provider never hangs the dashboard.
async function http_probe({ url, headers = {}, method = "GET", fetcher, timeout_ms = 5000 }) {
  const do_fetch = fetcher ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout_ms);
  const started = Date.now();
  try {
    const response = await do_fetch(url, { method, headers, signal: controller.signal });
    return { ok: response.ok, status: response.status, latency_ms: Date.now() - started };
  } catch (caught) {
    const aborted = caught?.name === "AbortError";
    return { ok: false, status: null, latency_ms: Date.now() - started, error: aborted ? "timeout" : caught.message };
  } finally {
    clearTimeout(timer);
  }
}

async function default_s3_probe(bucket, region, deps) {
  if (deps.s3_probe) {
    return deps.s3_probe(bucket);
  }
  const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region });
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
}

export const integration_definitions = [
  {
    key: "postgresql",
    label: "PostgreSQL",
    group: "core",
    is_configured: (cfg = default_config) => Boolean(cfg.database_url),
    async check(deps = {}) {
      if (!deps.pool) {
        return not_configured("Sin pool de base de datos.");
      }
      const started = Date.now();
      try {
        await deps.pool.query("SELECT 1");
        return ok("Conexión y consulta OK.", Date.now() - started);
      } catch (caught) {
        return error(caught.message, Date.now() - started);
      }
    },
  },
  {
    key: "whatsapp",
    label: "WhatsApp Cloud API",
    group: "messaging",
    is_configured: (cfg = default_config) => Boolean(cfg.whatsapp_access_token && cfg.whatsapp_phone_number_id),
    async check(deps = {}) {
      const cfg = deps.config ?? default_config;
      if (!this.is_configured(cfg)) {
        return not_configured("Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID.");
      }
      const probe = await http_probe({
        url: `https://graph.facebook.com/v21.0/${cfg.whatsapp_phone_number_id}?fields=id`,
        headers: { Authorization: `Bearer ${cfg.whatsapp_access_token}` },
        fetcher: deps.fetcher,
      });
      return probe.ok
        ? ok("Número y token verificados con Meta.", probe.latency_ms)
        : error(`Meta respondió ${probe.status ?? probe.error}.`, probe.latency_ms);
    },
  },
  {
    key: "s3",
    label: "Almacenamiento S3",
    group: "storage",
    is_configured: (cfg = default_config) => Boolean(cfg.knowledge_s3_bucket || cfg.memory_s3_bucket),
    async check(deps = {}) {
      const cfg = deps.config ?? default_config;
      const bucket = cfg.knowledge_s3_bucket || cfg.memory_s3_bucket;
      if (!bucket) {
        return not_configured("Sin bucket S3 configurado (knowledge/memory en modo local).");
      }
      const started = Date.now();
      try {
        await default_s3_probe(bucket, cfg.aws_region, deps);
        return ok(`Bucket ${bucket} accesible.`, Date.now() - started);
      } catch (caught) {
        return error(caught.message, Date.now() - started);
      }
    },
  },
  {
    key: "elevenlabs",
    label: "ElevenLabs (voz)",
    group: "voice",
    is_configured: (cfg = default_config) => Boolean(cfg.elevenlabs_api_key),
    async check(deps = {}) {
      const cfg = deps.config ?? default_config;
      if (!this.is_configured(cfg)) {
        return not_configured("Falta ELEVENLABS_API_KEY.");
      }
      const base = String(cfg.elevenlabs_base_url ?? "https://api.elevenlabs.io").replace(/\/$/, "");
      const probe = await http_probe({
        url: `${base}/v1/user`,
        headers: { "xi-api-key": cfg.elevenlabs_api_key },
        fetcher: deps.fetcher,
      });
      return probe.ok
        ? ok("API key válida.", probe.latency_ms)
        : error(`ElevenLabs respondió ${probe.status ?? probe.error}.`, probe.latency_ms);
    },
  },
  {
    key: "openai",
    label: "OpenAI",
    group: "ai",
    is_configured: (cfg = default_config) => Boolean(cfg.openai_api_key),
    async check(deps = {}) {
      const cfg = deps.config ?? default_config;
      if (!this.is_configured(cfg)) {
        return not_configured("Falta OPENAI_API_KEY (AI en modo mock).");
      }
      const base = String(cfg.openai_base_url ?? "https://api.openai.com/v1").replace(/\/$/, "");
      const probe = await http_probe({
        url: `${base}/models`,
        headers: { Authorization: `Bearer ${cfg.openai_api_key}` },
        fetcher: deps.fetcher,
      });
      return probe.ok
        ? ok("API key válida.", probe.latency_ms)
        : error(`OpenAI respondió ${probe.status ?? probe.error}.`, probe.latency_ms);
    },
  },
  {
    key: "google_places",
    label: "Google Places (prospección)",
    group: "prospecting",
    is_configured: (cfg = default_config) => Boolean(cfg.google_places_api_key),
    async check(deps = {}) {
      const cfg = deps.config ?? default_config;
      if (!this.is_configured(cfg)) {
        return not_configured("Falta GOOGLE_PLACES_API_KEY (prospección desactivada).");
      }
      const probe = await http_probe({
        url: "https://places.googleapis.com/v1/places:searchText",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": cfg.google_places_api_key,
          "X-Goog-FieldMask": "places.id",
        },
        fetcher: deps.fetcher,
      });
      return probe.ok
        ? ok("API key válida.", probe.latency_ms)
        : error(`Google Places respondió ${probe.status ?? probe.error}.`, probe.latency_ms);
    },
  },
];

export async function run_integration_checks(deps = {}) {
  const cfg = deps.config ?? default_config;
  const results = await Promise.all(
    integration_definitions.map(async (integration) => {
      const base = { key: integration.key, label: integration.label, group: integration.group, configured: integration.is_configured(cfg) };
      try {
        const result = await integration.check(deps);
        return { ...base, ...result };
      } catch (caught) {
        return { ...base, status: INTEGRATION_STATUS.error, detail: caught.message, latency_ms: null };
      }
    }),
  );
  return results;
}
