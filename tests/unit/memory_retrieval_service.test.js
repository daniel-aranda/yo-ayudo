import { rmSync as rm_sync } from "node:fs";
import { afterEach as after_each, describe, expect, it } from "vitest";
import { create_test_pool } from "../helpers/test_pool.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { memory_document_service } from "../../src/memory/memory_document_service.js";
import { memory_retrieval_service } from "../../src/memory/memory_retrieval_service.js";

const base_dir = ".storage/test-retrieval";

describe("memory_retrieval_service", () => {
  after_each(() => {
    rm_sync(base_dir, { recursive: true, force: true });
  });

  it("does not cross tenants and respects limit", async () => {
    const pool = await create_test_pool();
    const tenant = await pool.query("SELECT id FROM tenants WHERE slug = 'margen-sabroso' LIMIT 1");
    const tenant_id = tenant.rows[0].id;
    const other_tenant = await pool.query(
      "INSERT INTO tenants (name, slug, status, timezone) VALUES ('Otro', 'otro', 'active', 'America/Mexico_City') RETURNING id",
    );
    const service = new memory_document_service({
      pool,
      store: new local_memory_store({ base_dir }),
    });

    await service.create_document({
      tenant_id,
      scope: "tenant",
      document_type: "client_knowledge",
      title: "Preferencia demo",
      content: "respuesta corta para compras",
      source_table: "knowledge_sources",
      source_id: "11111111-1111-4111-8111-111111111111",
      metadata_json: { intent: "purchase" },
    });
    await service.create_document({
      tenant_id: other_tenant.rows[0].id,
      scope: "tenant",
      document_type: "client_knowledge",
      title: "Otro tenant",
      content: "dato privado de otro tenant",
      source_table: "knowledge_sources",
      source_id: "22222222-2222-4222-8222-222222222222",
      metadata_json: { intent: "purchase" },
    });

    const retrieval = new memory_retrieval_service({ pool });
    const result = await retrieval.retrieve_context({
      tenant_id,
      query: "purchase compras respuesta corta",
      scopes: ["tenant"],
      document_types: ["client_knowledge"],
      limit: 1,
    });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].title).toBe("Preferencia demo");
    expect(result.documents[0].content).not.toContain("otro tenant");
    await pool.end();
  });
});
