// Helpers compartidos para la config de AI por scope (global → cuenta → bot).
// "Heredar" se representa por ausencia del provider o por el centinela INHERIT,
// para que los tres niveles usen el mismo criterio y no se desincronicen.

export const INHERIT = "inherit";

// Providers de AI que el usuario puede elegir explícitamente.
export const AI_PROVIDERS = ["openai", "gemini", "claude"];

// Modelo por defecto cuando un scope define provider pero deja el model en blanco.
// (Los ids de OpenAI siguen la convención forward-dated del proyecto; gemini/claude
// usan ids actuales. supported_ai_model_options expone las opciones de la UI.)
export const DEFAULT_MODEL_BY_PROVIDER = {
  openai: "gpt-5.2",
  gemini: "gemini-2.5-flash",
  claude: "claude-opus-4-8",
  mock: "mock-local",
  bedrock: "",
};

// true cuando el valor representa "heredar del scope de arriba": vacío, nulo o el
// centinela explícito. Cualquier otro string es un provider concreto.
export function is_inherit(value) {
  if (value === null || value === undefined) return true;
  const text = String(value).trim().toLowerCase();
  return text === "" || text === INHERIT;
}

export function default_model_for(provider) {
  return DEFAULT_MODEL_BY_PROVIDER[provider] ?? "";
}
