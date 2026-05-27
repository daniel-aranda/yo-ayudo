import { rmSync as rm_sync } from "node:fs";
import { afterEach as after_each, describe, expect, it } from "vitest";
import { business_knowledge_service } from "../../src/knowledge/business_knowledge_service.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { memory_document_service } from "../../src/memory/memory_document_service.js";
import { create_test_pool } from "../helpers/test_pool.js";

const base_dir = ".storage/test-business-knowledge";

describe("business_knowledge_service", () => {
  after_each(() => {
    rm_sync(base_dir, { recursive: true, force: true });
  });

  it("retrieves business knowledge by account and bot without returning conversation memory", async () => {
    const pool = await create_test_pool();
    const ids = await pool.query(`
      SELECT
        organizations.id AS organization_id,
        accounts.id AS account_id,
        tenants.id AS tenant_id,
        bots.id AS bot_id
      FROM organizations
      JOIN accounts ON accounts.organization_id = organizations.id
      JOIN tenants ON tenants.id = accounts.tenant_id
      JOIN bots ON bots.account_id = accounts.id
      WHERE bots.bot_type = 'custom'
      LIMIT 1
    `);
    const row = ids.rows[0];
    const service = new business_knowledge_service({
      pool,
      document_service: new memory_document_service({
        pool,
        store: new local_memory_store({ base_dir }),
      }),
    });

    await service.create_document({
      organization_id: row.organization_id,
      account_id: row.account_id,
      bot_id: row.bot_id,
      tenant_id: row.tenant_id,
      scope: "bot",
      document_type: "business_price",
      title: "Precios dentales",
      content: "La limpieza dental cuesta desde 700 pesos.",
      source_name: "Lista de precios",
      source_type: "manual",
    });

    const result = await service.retrieve_relevant_knowledge({
      organization_id: row.organization_id,
      account_id: row.account_id,
      bot_id: row.bot_id,
      tenant_id: row.tenant_id,
      query: "cuanto cuesta limpieza dental",
      limit: 5,
    });

    expect(result.documents.some((document) => document.title === "Precios dentales")).toBe(true);
    expect(result.documents.every((document) => document.document_family === "business_knowledge")).toBe(true);
    expect(result.documents.every((document) => document.document_type !== "conversation_message")).toBe(true);

    await pool.end();
  });
});
