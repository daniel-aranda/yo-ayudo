import { describe, it, expect } from "vitest";
import { resolve_ai_config } from "../../src/ai/ai_config_resolver.js";
import { INHERIT } from "../../src/ai/ai_config_scope.js";

const bot = (ai) => ({ definition_json: { ai } });
const account = (ai) => ({ settings_json: { ai } });
const env = { provider: "openai", model: "gpt-5.2" };

describe("resolve_ai_config", () => {
  it("bot gana sobre cuenta, global y env", () => {
    const r = resolve_ai_config({
      bot: bot({ provider: "claude", model: "claude-sonnet-4-6" }),
      account: account({ provider: "gemini", model: "gemini-2.5-flash" }),
      global: { provider: "openai", model: "gpt-5.5" },
      env,
    });
    expect(r).toMatchObject({ provider: "claude", model: "claude-sonnet-4-6", source: "bot" });
  });

  it("cuenta gana cuando el bot hereda", () => {
    const r = resolve_ai_config({
      bot: bot({ provider: INHERIT }),
      account: account({ provider: "gemini", model: "gemini-2.5-flash" }),
      global: { provider: "openai", model: "gpt-5.5" },
      env,
    });
    expect(r).toMatchObject({ provider: "gemini", source: "account" });
  });

  it("global gana cuando bot y cuenta heredan", () => {
    const r = resolve_ai_config({
      bot: bot({}),
      account: account({ provider: "" }),
      global: { provider: "claude", model: "claude-sonnet-4-6" },
      env,
    });
    expect(r).toMatchObject({ provider: "claude", source: "global" });
  });

  it("env es el piso cuando todo hereda", () => {
    const r = resolve_ai_config({ bot: bot({ provider: null }), account: null, global: null, env });
    expect(r).toMatchObject({ provider: "openai", model: "gpt-5.2", source: "env" });
  });

  it("trata vacío / null / 'inherit' como heredar", () => {
    for (const v of ["", null, undefined, "inherit", "  ", "INHERIT"]) {
      const r = resolve_ai_config({ bot: bot({ provider: v }), global: { provider: "gemini" }, env });
      expect(r.source).toBe("global");
    }
  });

  it("provider y model salen del MISMO scope (no se cruzan)", () => {
    // bot define provider sin model → model = default del provider del bot,
    // NUNCA el model de la cuenta.
    const r = resolve_ai_config({
      bot: bot({ provider: "gemini" }),
      account: account({ provider: "openai", model: "gpt-5.5" }),
      env,
    });
    expect(r).toMatchObject({ provider: "gemini", model: "gemini-2.5-flash", source: "bot" });
  });

  it("tolera bot/account nulos y cae a mock si no hay env", () => {
    const r = resolve_ai_config({ bot: null, account: null, global: null, env: null });
    expect(r).toMatchObject({ provider: "mock", source: "default" });
  });
});
