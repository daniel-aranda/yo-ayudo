import { describe, expect, it } from "vitest";
import { should_ingest_message_to_memory } from "../../src/memory/memory_ingestion_service.js";

function input_for(text, intent) {
  return {
    message: {
      direction: "inbound",
      text_body: text,
    },
    parsing_result: {
      intent,
      needs_review: false,
      metadata_json: {},
    },
  };
}

describe("should_ingest_message_to_memory", () => {
  it("ignores simple confirmations", () => {
    expect(should_ingest_message_to_memory(input_for("ok", "unknown"))).toBe(false);
    expect(should_ingest_message_to_memory(input_for("gracias", "unknown"))).toBe(false);
  });

  it("accepts useful operational intents", () => {
    expect(should_ingest_message_to_memory(input_for("compré 12 kg pastor por 1680", "purchase"))).toBe(true);
    expect(should_ingest_message_to_memory(input_for("cerramos con 8500 ventas", "daily_close"))).toBe(true);
    expect(should_ingest_message_to_memory(input_for("sobró pastor y faltó tortilla", "daily_note"))).toBe(true);
  });
});
