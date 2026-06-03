import { config } from "../app/config.js";
import { bedrock_provider } from "./bedrock_provider.js";
import { mock_provider } from "./mock_provider.js";
import { openai_provider } from "./openai_provider.js";

export function create_model_provider() {
  if (config.ai_provider === "bedrock") {
    return new bedrock_provider();
  }

  if (config.ai_provider === "openai") {
    return new openai_provider();
  }

  return new mock_provider();
}
