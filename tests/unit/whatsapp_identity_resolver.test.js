import { describe, expect, it } from "vitest";
import { resolve_whatsapp_identity_by_phone_number_id } from "../../src/channels/whatsapp/whatsapp_identity_resolver.js";
import { create_test_pool } from "../helpers/test_pool.js";

describe("whatsapp_identity_resolver", () => {
  it("resolves organization, account and active bot assignment from phone_number_id", async () => {
    const pool = await create_test_pool();
    const phone_number = await pool.query("SELECT * FROM whatsapp_phone_numbers LIMIT 1");
    const assignment = await pool.query("SELECT * FROM phone_number_bot_assignments WHERE status = 'active' LIMIT 1");

    const identity = await resolve_whatsapp_identity_by_phone_number_id(
      pool,
      phone_number.rows[0].phone_number_id,
    );

    expect(identity.whatsapp_phone_number.id).toBe(phone_number.rows[0].id);
    expect(identity.phone_number_bot_assignment.id).toBe(assignment.rows[0].id);
    expect(identity.organization.name).toBe("YoAyudo Demo");
    expect(identity.account.name).toBe("Demo Account");
    expect(identity.account.tenant_id).toBe(identity.tenant.id);
    expect(identity.bot.id).toBe(assignment.rows[0].bot_id);

    await pool.end();
  });
});
