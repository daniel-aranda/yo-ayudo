import { rmSync as rm_sync } from "node:fs";
import { afterEach as after_each, describe, expect, it } from "vitest";
import { conversation_memory_service } from "../../src/memory/conversation_memory_service.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { memory_document_service } from "../../src/memory/memory_document_service.js";
import { create_test_pool } from "../helpers/test_pool.js";

const base_dir = ".storage/test-conversation-memory";

describe("conversation_memory_service", () => {
  after_each(() => {
    rm_sync(base_dir, { recursive: true, force: true });
  });

  it("retrieves conversation memory for one conversation without returning business knowledge", async () => {
    const pool = await create_test_pool();
    const ids = await pool.query(`
      SELECT
        organizations.id AS organization_id,
        accounts.id AS account_id,
        tenants.id AS tenant_id,
        contacts.id AS contact_id,
        bots.id AS bot_id
      FROM organizations
      JOIN accounts ON accounts.organization_id = organizations.id
      JOIN tenants ON tenants.id = accounts.tenant_id
      JOIN contacts ON contacts.tenant_id = tenants.id
      JOIN bots ON bots.account_id = accounts.id
      LIMIT 1
    `);
    const conversation = await pool.query(
      `
        INSERT INTO conversations (tenant_id, bot_id, contact_id, channel, status, last_message_at)
        VALUES ($1, $2, $3, 'whatsapp', 'open', now())
        RETURNING id
      `,
      [ids.rows[0].tenant_id, ids.rows[0].bot_id, ids.rows[0].contact_id],
    );
    const row = { ...ids.rows[0], conversation_id: conversation.rows[0].id };
    const service = new conversation_memory_service({
      pool,
      document_service: new memory_document_service({
        pool,
        store: new local_memory_store({ base_dir }),
      }),
    });

    await service.record_document({
      organization_id: row.organization_id,
      account_id: row.account_id,
      tenant_id: row.tenant_id,
      contact_id: row.contact_id,
      conversation_id: row.conversation_id,
      bot_id: row.bot_id,
      scope: "conversation",
      document_type: "pending_action",
      title: "Pendiente de cita",
      content: "El cliente pidió enviar horarios disponibles para limpieza dental.",
      source_table: "conversations",
      source_id: row.conversation_id,
      metadata_json: { source: "test" },
    });

    const result = await service.retrieve_relevant_memory({
      organization_id: row.organization_id,
      account_id: row.account_id,
      tenant_id: row.tenant_id,
      contact_id: row.contact_id,
      conversation_id: row.conversation_id,
      bot_id: row.bot_id,
      query: "horarios disponibles limpieza",
      limit: 5,
    });

    expect(result.documents.some((document) => document.title === "Pendiente de cita")).toBe(true);
    expect(result.documents.every((document) => document.document_family === "conversation_memory")).toBe(true);
    expect(result.documents.every((document) => !document.document_type.startsWith("business_"))).toBe(true);

    await pool.end();
  });
});
