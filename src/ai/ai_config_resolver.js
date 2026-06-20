import { is_inherit, default_model_for } from "./ai_config_scope.js";

// Normaliza el `ai` crudo de un scope a {provider, model} o null si hereda.
// El model SIEMPRE sale del mismo scope que el provider (nunca se cruzan): si el
// scope define provider pero no model, se rellena con el default de ESE provider.
function scope_ai(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (is_inherit(raw.provider)) return null;
  const provider = String(raw.provider).trim().toLowerCase();
  const model = raw.model && String(raw.model).trim() ? String(raw.model).trim() : default_model_for(provider);
  return { provider, model };
}

// Resuelve qué provider/model de AI usar para un bot, con precedencia
// bot > cuenta > global > env. Devuelve {provider, model, source} donde source
// indica de qué nivel salió (útil para el hint de la UI y la observabilidad).
//
// Entradas (objetos ya cargados; cualquiera puede ser null/undefined):
//   bot.definition_json.ai, account.settings_json.ai, global (= {provider,model}
//   de platform_settings), env (= {provider,model} de config). El piso es env;
//   si todo hereda y no hay env, cae a mock (nunca undefined).
export function resolve_ai_config({ bot, account, global, env } = {}) {
  const candidates = [
    { source: "bot", ai: bot?.definition_json?.ai },
    { source: "account", ai: account?.settings_json?.ai },
    { source: "global", ai: global },
    { source: "env", ai: env },
  ];

  for (const candidate of candidates) {
    const resolved = scope_ai(candidate.ai);
    if (resolved) return { ...resolved, source: candidate.source };
  }

  return { provider: "mock", model: default_model_for("mock"), source: "default" };
}
