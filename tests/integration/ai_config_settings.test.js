import { describe, it, expect, beforeEach } from "vitest";
import { create_test_pool } from "../helpers/test_pool.js";
import { get_platform_ai_config, upsert_platform_ai_config } from "../../src/app/platform_settings_repository.js";
import { update_account_ai_config, get_account_by_id } from "../../src/accounts/account_repository.js";
import { resolve_ai_config } from "../../src/ai/ai_config_resolver.js";

describe("platform_settings (default global de AI) + migración 0020", () => {
  let pool;
  beforeEach(async () => {
    pool = await create_test_pool();
  });

  it("get → null cuando no hay fila", async () => {
    expect(await get_platform_ai_config(pool)).toBeNull();
  });

  it("upsert + get round-trip (incluye ON CONFLICT)", async () => {
    await upsert_platform_ai_config(pool, { provider: "gemini", model: "gemini-2.5-flash" });
    expect(await get_platform_ai_config(pool)).toMatchObject({ provider: "gemini", model: "gemini-2.5-flash" });
    await upsert_platform_ai_config(pool, { provider: "claude", model: "claude-opus-4-8" });
    expect(await get_platform_ai_config(pool)).toMatchObject({ provider: "claude", model: "claude-opus-4-8" });
  });

  it("get tolera tabla ausente → null (no lanza)", async () => {
    const broken = { query: async () => { throw new Error("relation \"platform_settings\" does not exist"); } };
    expect(await get_platform_ai_config(broken)).toBeNull();
  });

  it("accounts.settings_json existe y default {} (migración 0020)", async () => {
    const org = await pool.query("INSERT INTO organizations (name, slug) VALUES ('AI Test', 'ai-test-org') RETURNING id");
    const acct = await pool.query(
      "INSERT INTO accounts (organization_id, name, slug) VALUES ($1, 'AI Test', 'ai-test-acct') RETURNING settings_json",
      [org.rows[0].id],
    );
    expect(acct.rows[0].settings_json).toEqual({});
  });
});

describe("update_account_ai_config (merge, sin clobber) + resolución", () => {
  let pool;
  let account_id;
  beforeEach(async () => {
    pool = await create_test_pool();
    const org = await pool.query("INSERT INTO organizations (name, slug) VALUES ('AcctAI', 'acctai-org') RETURNING id");
    const acct = await pool.query(
      "INSERT INTO accounts (organization_id, name, slug, settings_json) VALUES ($1, 'AcctAI', 'acctai-acct', $2::jsonb) RETURNING id",
      [org.rows[0].id, JSON.stringify({ foo: "bar" })],
    );
    account_id = acct.rows[0].id;
  });

  it("setea ai sin borrar otras keys de settings_json", async () => {
    const result = await update_account_ai_config(pool, account_id, { provider: "gemini", model: "gemini-2.5-flash" });
    expect(result).toMatchObject({ foo: "bar", ai: { provider: "gemini", model: "gemini-2.5-flash" } });
  });

  it("provider inherit borra la clave ai (hereda del global)", async () => {
    await update_account_ai_config(pool, account_id, { provider: "claude", model: "claude-opus-4-8" });
    const result = await update_account_ai_config(pool, account_id, { provider: "inherit" });
    expect(result).toMatchObject({ foo: "bar" });
    expect(result.ai).toBeUndefined();
  });

  it("resolve_ai_config usa el ai de la cuenta cargada", async () => {
    await update_account_ai_config(pool, account_id, { provider: "gemini", model: "gemini-2.5-flash" });
    const account = await get_account_by_id(pool, account_id);
    const r = resolve_ai_config({ bot: null, account, global: null, env: { provider: "openai", model: "gpt-5.2" } });
    expect(r).toMatchObject({ provider: "gemini", source: "account" });
  });
});
