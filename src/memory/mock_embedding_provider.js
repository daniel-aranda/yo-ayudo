import { createHash } from "node:crypto";

export class mock_embedding_provider {
  async embed_text(input) {
    const hash = createHash("sha256")
      .update(input.text)
      .update(JSON.stringify(input.metadata ?? {}))
      .digest("hex");

    return {
      provider: "mock",
      model: "mock_embedding_v1",
      vector_id: hash,
      dimensions: 16,
    };
  }
}
