import { config as default_config } from "../app/config.js";
import { integration_definitions } from "../integrations/integration_registry.js";
import { get_action } from "../actions/action_registry.js";

// Qué proveedor externo necesita cada action EJECUTABLE para operar de verdad.
// Las internas (CRM, notas, tareas, resumen, consultar humano) no dependen de un
// proveedor externo, así que no generan warning. `any_of`: basta uno configurado.
const ACTION_PROVIDER_REQUIREMENTS = {
  buscar_negocios: { any_of: ["google_places", "yelp_fusion", "serpapi"], label: "una API de búsqueda de negocios (Google Places, Yelp o SerpAPI)" },
  responder_con_voz: { any_of: ["elevenlabs"], label: "ElevenLabs (voz)" },
  generar_imagen: { any_of: ["openai", "gemini"], label: "un proveedor de imágenes (OpenAI o Gemini)" },
  generar_documento: { any_of: ["openai", "gemini", "claude"], label: "un proveedor de IA (OpenAI, Gemini o Claude)" },
};

// ¿Está configurado un proveedor? Reusa `is_configured` del integration_registry
// (fuente de verdad, sin llamadas de red); yelp/serpapi se checan contra config.
function provider_configured(key, cfg) {
  const definition = integration_definitions.find((integration) => integration.key === key);
  if (definition) return definition.is_configured(cfg);
  if (key === "yelp_fusion") return Boolean(cfg.yelp_fusion_api_key);
  if (key === "serpapi") return Boolean(cfg.serpapi_api_key);
  if (key === "gemini") return Boolean(cfg.gemini_api_key);
  if (key === "claude" || key === "anthropic") return Boolean(cfg.anthropic_api_key);
  return false;
}

// provider de AI → key del integration_registry + etiqueta para el blocker.
const AI_PROVIDER_KEY = { openai: "openai", gemini: "gemini", claude: "claude" };
const AI_PROVIDER_LABEL = { openai: "OpenAI", gemini: "Gemini", claude: "Claude" };

// Lista lo que IMPIDE (blocker) o DEGRADA (warning) que el bot opere de verdad,
// derivado de su config real (estado + canales + acciones habilitadas) cruzada
// con los proveedores configurados. No basta `status='active'`: un bot sin canal,
// sin IA o con una acción sin proveedor está "activo" pero no funciona realmente.
export function compute_bot_readiness(bot, { whatsapp_channels = [], instagram_channels = [], config = default_config, resolved_ai = null } = {}) {
  if (!bot) return { warnings: [], blockers: 0, ready: false };

  const warnings = [];
  const add = (severity, title, detail) => warnings.push({ severity, title, detail });

  const enabled_actions = Array.isArray(bot.acciones_habilitadas_json) ? bot.acciones_habilitadas_json : [];
  const has_channel = whatsapp_channels.length + instagram_channels.length > 0;

  // 1) Estado: en borrador/pausado no entra al pipeline inbound.
  if (bot.status !== "active") {
    add("blocker", "El bot no está activo", `Está en "${bot.status}". Actívalo para que reciba y responda mensajes.`);
  }

  // 2) Canal: sin canal no puede recibir ni enviar nada.
  if (!has_channel) {
    add("blocker", "Sin canal conectado", "Conéctale un número de WhatsApp (pestaña Canales) para que pueda recibir y responder mensajes.");
  }

  // 3) IA real: el provider RESUELTO del bot (bot > cuenta > global > env) debe
  // estar configurado; si no, el motor cae a coincidencia por palabras clave.
  // Sin `resolved_ai` se asume OpenAI (compatibilidad con el check histórico).
  const ai_provider = resolved_ai?.provider ?? "openai";
  if (ai_provider === "mock") {
    add("blocker", "Sin IA real", "El bot usa coincidencia por palabras clave, no lenguaje libre. Elige un proveedor de IA (OpenAI, Gemini o Claude) y configúralo en Integraciones.");
  } else {
    const key = AI_PROVIDER_KEY[ai_provider];
    const label = AI_PROVIDER_LABEL[ai_provider] ?? ai_provider;
    if (!key || !provider_configured(key, config)) {
      add("blocker", `Sin IA real (${label})`, `Falta la API key de ${label}: el bot entiende por palabras clave, no lenguaje libre. Configúrala en Integraciones.`);
    }
  }

  // 4) Acciones habilitadas que necesitan un proveedor externo configurado.
  for (const action_id of enabled_actions) {
    const action = get_action(action_id);
    const action_name = action?.nombre ?? action_id;
    const requirement = ACTION_PROVIDER_REQUIREMENTS[action_id];
    if (requirement && !requirement.any_of.some((key) => provider_configured(key, config))) {
      add("blocker", `"${action_name}" no puede operar`, `Necesita ${requirement.label}. Sin eso, esta acción no se ejecuta (registra un guardrail).`);
    }
    // El stub vive en el `handler` (stub_*), no en el action_id.
    if (action?.handler && String(action.handler).startsWith("stub_")) {
      add("warning", `"${action_name}" aún no está implementada`, "Es una capacidad de roadmap (stub): registra el intento pero todavía no ejecuta nada real.");
    }
  }

  const blockers = warnings.filter((warning) => warning.severity === "blocker").length;
  return { warnings, blockers, ready: blockers === 0 };
}
