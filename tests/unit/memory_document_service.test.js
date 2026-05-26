import { rmSync as rm_sync } from "node:fs";
import { randomUUID as random_uuid } from "node:crypto";
import { afterEach as after_each, describe, expect, it } from "vitest";
import { create_test_pool } from "../helpers/test_pool.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import {
  content_hash_for_text,
  memory_document_service,
} from "../../src/memory/memory_document_service.js";

const base_dir = ".storage/test-document-service";

describe("memory_document_service", () => {
  after_each(() => {
    rm_sync(base_dir, { recursive: true, force: true });
  });

  it("creates deterministic content hash and does not duplicate source document", async () => {
    const pool = await create_test_pool({ seed: false });
    const service = new memory_document_service({
      pool,
      store: new local_memory_store({ base_dir }),
    });
    const source_id = random_uuid();
    const input = {
      scope: "global",
      document_type: "global_knowledge",
      title: "Global note",
      content: "same content",
      source_table: "knowledge_sources",
      source_id,
      metadata_json: { source: "test" },
    };

    const first = await service.create_document(input);
    const second = await service.create_document(input);
    const count = await pool.query("SELECT COUNT(*)::int AS count FROM memory_documents");

    expect(content_hash_for_text("same content")).toBe(first.content_hash);
    expect(second.id).toBe(first.id);
    expect(count.rows[0].count).toBe(1);
    expect(first.metadata_json.source).toBe("test");
    await pool.end();
  });
});
