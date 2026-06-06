import { config } from "../app/config.js";
import { bedrock_provider } from "./bedrock_provider.js";
import { mock_provider } from "./mock_provider.js";
import { openai_provider } from "./openai_provider.js";

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

  return new mock_provider();
}
