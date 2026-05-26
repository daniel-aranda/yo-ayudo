import { money_to_database, quantity_to_database } from "../../shared/money.js";
import { ensure_business_day } from "../business_days/business_day_repository.js";

async function find_inventory_item_id(pool, tenant_id, branch_id, item_name) {
  const result = await pool.query(
    `
      SELECT id
      FROM inventory_items
      WHERE tenant_id = $1
        AND branch_id = $2
        AND lower(name) = lower($3)
      LIMIT 1
    `,
    [tenant_id, branch_id, item_name],
  );

  return result.rows[0]?.id ?? null;
}

async function find_supplier_id(pool, tenant_id, branch_id, supplier_name) {
  if (!supplier_name) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT id
      FROM suppliers
      WHERE tenant_id = $1
        AND branch_id = $2
        AND (
          lower(name) = lower($3)
          OR lower(contact_name) = lower($3)
          OR lower(name) LIKE '%' || lower($3) || '%'
        )
      LIMIT 1
    `,
    [tenant_id, branch_id, supplier_name],
  );

  return result.rows[0]?.id ?? null;
}

export async function record_purchase(pool, context, data) {
  const business_day = await ensure_business_day(pool, context);
  const inventory_item_id = await find_inventory_item_id(pool, context.tenant_id, context.branch_id, data.item_name);
  const supplier_id = await find_supplier_id(pool, context.tenant_id, context.branch_id, data.supplier_name_raw);

  await pool.query(
    `
      INSERT INTO op_purchases (
        tenant_id,
        branch_id,
        business_day_id,
        item_name,
        inventory_item_id,
        quantity,
        unit,
        total_cost,
        supplier_id,
        supplier_name_raw,
        source_message_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      context.tenant_id,
      context.branch_id,
      business_day.id,
      data.item_name,
      inventory_item_id,
      quantity_to_database(data.quantity),
      data.unit,
      money_to_database(data.total_cost),
      supplier_id,
      data.supplier_name_raw ?? null,
      context.source_message_id,
    ],
  );

  return { business_day_id: business_day.id };
}
