import { afterEach as after_each, describe, expect, it, vi } from "vitest";
import { openai_provider } from "../../src/ai/openai_provider.js";

function make_provider() {
  return new openai_provider({ api_key: "test-key", model: "gpt-test", base_url: "https://fake.openai" });
}

function fetch_returning(body, { ok = true, status = 200 } = {}) {
  return vi.fn(async () => ({ ok, status, json: async () => body }));
}

describe("openai_provider.classify_intents", () => {
  after_each(() => {
    vi.unstubAllGlobals();
  });

  it("classifies multi-intent via the model, dropping unknown ids and deduping", async () => {
    const model_output = {
      id: "resp_classify_1",
      output_text: JSON.stringify({
        intents: [
          { intent: "day_start", confidence: 0.95, segment: "abrimos con 1500", reason: "apertura" },
          { intent: "sales_update", confidence: 1.4, segment: "vendimos 3200", reason: "ventas" },
          { intent: "no_existe", confidence: 0.9, segment: "x", reason: "inválido" },
          { intent: "day_start", confidence: 0.7, segment: "duplicado", reason: "dup" },
        ],
      }),
    };
    const fetch_spy = fetch_returning(model_output);
    vi.stubGlobal("fetch", fetch_spy);

    const result = await make_provider().classify_intents({
      text: "abrimos con 1500 y vendimos 3200",
      use_ai_classification: true,
    });

    expect(fetch_spy).toHaveBeenCalledOnce();
    expect(result.provider).toBe("openai");
    expect(result.response_id).toBe("resp_classify_1");
    // Solo intents válidos, sin duplicados, confianza clampeada a [0,1].
    expect(result.intents.map((i) => i.intent)).toEqual(["day_start", "sales_update"]);
    expect(result.intents[1].confidence).toBe(1);
    expect(result.intents[0].segment).toBe("abrimos con 1500");
  });

  it("falls back to unknown when the model returns no valid intents", async () => {
    vi.stubGlobal("fetch", fetch_returning({ id: "r", output_text: JSON.stringify({ intents: [] }) }));
    const result = await make_provider().classify_intents({ text: "hola", use_ai_classification: true });
    expect(result.intents).toEqual([
      expect.objectContaining({ intent: "unknown", segment: "hola" }),
    ]);
  });

  it("throws on a non-ok response so the caller can degrade and log the failure", async () => {
    vi.stubGlobal(
      "fetch",
      fetch_returning({ error: { message: "rate limited", code: "rate_limit" } }, { ok: false, status: 429 }),
    );
    await expect(make_provider().classify_intents({ text: "abrimos", use_ai_classification: true })).rejects.toMatchObject({
      code: "openai_rate_limit",
      status: 429,
    });
  });

  it("uses the deterministic keyword classifier (no network) when not opted in", async () => {
    const fetch_spy = vi.fn(() => {
      throw new Error("network must not be called");
    });
    vi.stubGlobal("fetch", fetch_spy);

    const result = await make_provider().classify_intents({ text: "vendimos 3200", use_ai_classification: false });

    expect(fetch_spy).not.toHaveBeenCalled();
    expect(result.intents[0].intent).toBe("sales_update");
  });

  it("stays deterministic when opted in but no API key is configured", async () => {
    const fetch_spy = vi.fn(() => {
      throw new Error("network must not be called");
    });
    vi.stubGlobal("fetch", fetch_spy);

    const provider = new openai_provider({ api_key: "", model: "gpt-test", base_url: "https://fake.openai" });
    const result = await provider.classify_intents({ text: "cerramos", use_ai_classification: true });

    expect(fetch_spy).not.toHaveBeenCalled();
    expect(result.intents[0].intent).toBe("daily_close");
  });
});
