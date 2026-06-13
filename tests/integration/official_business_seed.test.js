import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { upsert_account, upsert_organization } from "../../src/db/seed.js";
import { create_test_pool } from "../helpers/test_pool.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("official YoAyudo business seeding", () => {
  let pool;

  before_each(async () => {
    pool = await create_test_pool({ seed: false });
  });

  after_each(async () => {
    await pool?.end();
  });

  it("pins the official business/account to explicit env ids and keeps them stable on re-seed", async () => {
    const business_id = "11111111-1111-1111-1111-111111111111";
    const account_id = "22222222-2222-2222-2222-222222222222";

    expect(await upsert_organization(pool, { id: business_id })).toBe(business_id);
    expect(await upsert_account(pool, business_id, { id: account_id })).toBe(account_id);

    // Re-seed con otros ids no debe cambiar lo ya creado (resuelve por slug).
    expect(await upsert_organization(pool, { id: "33333333-3333-3333-3333-333333333333" })).toBe(business_id);
    expect(await upsert_account(pool, business_id, { id: "44444444-4444-4444-4444-444444444444" })).toBe(account_id);

    const org = await pool.query("SELECT slug, status FROM organizations WHERE id = $1", [business_id]);
    expect(org.rows[0]).toMatchObject({ slug: "yoayudo-demo", status: "active" });
    const account = await pool.query("SELECT slug, organization_id FROM accounts WHERE id = $1", [account_id]);
    expect(account.rows[0]).toMatchObject({ slug: "yoayudo-ventas", organization_id: business_id });
  });

  it("falls back to a generated uuid when no env id is provided", async () => {
    const org_id = await upsert_organization(pool);
    expect(org_id).toMatch(UUID_RE);
    const account_id = await upsert_account(pool, org_id);
    expect(account_id).toMatch(UUID_RE);
    expect(account_id).not.toBe(org_id);
  });
});
