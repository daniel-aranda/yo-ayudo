import { config } from "../app/config.js";
import { bedrock_provider } from "./bedrock_provider.js";
import { mock_provider } from "./mock_provider.js";
import { openai_provider } from "./openai_provider.js";
import { gemini_provider } from "./gemini_provider.js";
import { claude_provider } from "./claude_provider.js";

export function create_model_provider(options = {}) {
  const provider = options.provider ?? config.ai_provider;

  if (options.prefer_openai_when_configured && provider === "mock" && config.openai_api_key) {
    return new openai_provider({ model: options.model });
  }

  if (provider === "bedrock") {
    return new bedrock_provider();
  }

  if (provider === "openai") {
    return new openai_provider({ model: options.model });
  }

  // Gemini/Claude: solo si hay key configurada; si no, mock (nunca finge ni lanza
  // en construcción — el guardrail/readiness reporta que falta el proveedor).
  if (provider === "gemini") {
    return config.gemini_api_key ? new gemini_provider({ model: options.model }) : new mock_provider();
  }

  if (provider === "claude") {
    return config.anthropic_api_key ? new claude_provider({ model: options.model }) : new mock_provider();
  }

  return new mock_provider();
}
