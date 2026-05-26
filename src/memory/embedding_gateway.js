import { config } from "../app/config.js";
import { bedrock_embedding_provider } from "./bedrock_embedding_provider.js";
import { mock_embedding_provider } from "./mock_embedding_provider.js";

export class embedding_gateway {
  constructor(provider = create_embedding_provider()) {
    this.provider = provider;
  }

  embed_text(input) {
    return this.provider.embed_text(input);
  }
}

export function create_embedding_provider() {
  if (config.embedding_provider === "bedrock") {
    return new bedrock_embedding_provider();
  }

  return new mock_embedding_provider();
}
