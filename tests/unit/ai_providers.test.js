import { describe, it, expect, vi, afterEach } from "vitest";
import { create_model_provider } from "../../src/ai/provider_factory.js";
import { gemini_provider } from "../../src/ai/gemini_provider.js";
import { claude_provider } from "../../src/ai/claude_provider.js";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { config } from "../../src/app/config.js";

afterEach(() => vi.restoreAllMocks());

describe("create_model_provider gemini/claude", () => {
  it("sin key → mock_provider (nunca finge ni lanza en construcción)", () => {
    const g = config.gemini_api_key;
    const a = config.anthropic_api_key;
    config.gemini_api_key = "";
    config.anthropic_api_key = "";
    expect(create_model_provider({ provider: "gemini" })).toBeInstanceOf(mock_provider);
    expect(create_model_provider({ provider: "claude" })).toBeInstanceOf(mock_provider);
    config.gemini_api_key = g;
    config.anthropic_api_key = a;
  });

  it("con key → adapter real", () => {
    const g = config.gemini_api_key;
    const a = config.anthropic_api_key;
    config.gemini_api_key = "k";
    config.anthropic_api_key = "k";
    expect(create_model_provider({ provider: "gemini" })).toBeInstanceOf(gemini_provider);
    expect(create_model_provider({ provider: "claude" })).toBeInstanceOf(claude_provider);
    config.gemini_api_key = g;
    config.anthropic_api_key = a;
  });
});

describe("gemini_provider", () => {
  it("classify_intents sin use_ai_classification degrada a mock (no llama fetch)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await new gemini_provider({ api_key: "k" }).classify_intents({ text: "hola" });
    expect(spy).not.toHaveBeenCalled();
    expect(Array.isArray(result.intents)).toBe(true);
  });

  it("classify_intents con flag + fetch mock → intents normalizados, provider gemini", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"intents":[{"intent":"sales_update","confidence":0.9,"segment":"vendi 100","reason":"x"}]}' }] } }],
      }),
    });
    const result = await new gemini_provider({ api_key: "k" }).classify_intents({ text: "vendi 100", use_ai_classification: true });
    expect(result.provider).toBe("gemini");
    expect(result.intents[0].intent).toBe("sales_update");
  });

  it("decide_bot_test_message sin key lanza (no finge)", async () => {
    await expect(
      new gemini_provider({ api_key: "" }).decide_bot_test_message({ prompt: "", mensaje: "", acciones_disponibles: [] }),
    ).rejects.toThrow(/api_key/i);
  });
});

describe("claude_provider", () => {
  it("classify_intents con flag + fetch mock → intents normalizados, provider claude", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_1",
        content: [{ type: "text", text: '{"intents":[{"intent":"purchase","confidence":0.8,"segment":"compre","reason":"y"}]}' }],
      }),
    });
    const result = await new claude_provider({ api_key: "k" }).classify_intents({ text: "compre azucar", use_ai_classification: true });
    expect(result.provider).toBe("claude");
    expect(result.intents[0].intent).toBe("purchase");
  });

  it("decide_bot_test_message sin key lanza (no finge)", async () => {
    await expect(
      new claude_provider({ api_key: "" }).decide_bot_test_message({ prompt: "", mensaje: "", acciones_disponibles: [] }),
    ).rejects.toThrow(/api_key/i);
  });
});
