import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { action_execution_service } from "../../src/actions/action_execution_service.js";
import { create_test_pool } from "../helpers/test_pool.js";

describe("operational actions (ventas/compras/cierre as engine actions)", () => {
  let pool;
  let account;

  before_each(async () => {
    pool = await create_test_pool();
    account = (await pool.query("SELECT id, organization_id FROM accounts LIMIT 1")).rows[0];
  });

  after_each(async () => {
    await pool?.end();
  });

  function run(action_id, input_json) {
    return new action_execution_service({ pool }).execute_action({
      organization_id: account.organization_id,
      account_id: account.id,
      action_id,
      input_json: { operation_date: "2026-06-08", ...input_json },
      actor_type: "bot",
    });
  }

  it("registrar_venta records a sales update and rolls it into the business day", async () => {
    const result = await run("registrar_venta", {
      accumulated_sales: 5000,
      cash_sales: 3000,
      card_sales: 2000,
    });

    expect(result.status).toBe("executed");
    const sales = await pool.query("SELECT * FROM op_sales_updates");
    expect(sales.rowCount).toBe(1);
    expect(sales.rows[0].accumulated_sales).toBe(5000);
    const day = await pool.query("SELECT * FROM op_business_days WHERE operation_date = '2026-06-08'");
    expect(day.rows[0].total_sales).toBe(5000);
  });

  it("registrar_cierre_dia closes the day with totals", async () => {
    const result = await run("registrar_cierre_dia", { total_sales: 8500, cash_sales: 3000, card_sales: 5500 });

    expect(result.status).toBe("executed");
    const day = await pool.query("SELECT * FROM op_business_days WHERE operation_date = '2026-06-08'");
    expect(day.rows[0].status).toBe("closed");
    expect(day.rows[0].total_sales).toBe(8500);
  });

  it("registrar_compra records a purchase and writes an audit log", async () => {
    const result = await run("registrar_compra", {
      item_name: "pastor",
      quantity: 12,
      unit: "kg",
      total_cost: 1680,
      supplier_name_raw: "Juan",
    });

    expect(result.status).toBe("executed");
    const purchases = await pool.query("SELECT * FROM op_purchases");
    expect(purchases.rowCount).toBe(1);
    expect(purchases.rows[0].item_name).toBe("pastor");
    expect(purchases.rows[0].total_cost).toBe(1680);
    // every execution writes an auditable row
    const audit = await pool.query("SELECT * FROM action_audit_logs WHERE action_id = 'registrar_compra'");
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].status).toBe("executed");
  });
});
