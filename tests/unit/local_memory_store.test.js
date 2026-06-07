import { rmSync as rm_sync } from "node:fs";
import { afterEach as after_each, describe, expect, it } from "vitest";
import { local_memory_store } from "../../src/memory/local_memory_store.js";

const base_dir = ".storage/test-local-store";

describe("local_memory_store", () => {
  after_each(() => {
    rm_sync(base_dir, { recursive: true, force: true });
  });

  it("writes and reads a document", async () => {
    const store = new local_memory_store({ base_dir });
    const result = await store.put_document({
      document_id: "11111111-1111-4111-8111-111111111111",
      content: "knowledge content",
      metadata: { account_id: "account_a" },
    });
    const document = await store.get_document({
      document_id: "11111111-1111-4111-8111-111111111111",
      location: result,
    });

    expect(result.local_path).toContain(base_dir);
    expect(document.content).toBe("knowledge content");
    expect(document.metadata.account_id).toBe("account_a");
  });
});
