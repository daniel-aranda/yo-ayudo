import { quantity_to_database } from "../../shared/money.js";
import { ensure_business_day } from "../business_days/business_day_repository.js";

async function find_inventory_item_id(pool, account_id, item_name) {
  const result = await pool.query(
    `
      SELECT id
      FROM inventory_items
      WHERE account_id = $1
        AND lower(name) = lower($2)
      LIMIT 1
    `,
    [account_id, item_name],
  );

  return result.rows[0]?.id ?? null;
}

export async function record_inventory_snapshot(pool, context, data) {
  const business_day = await ensure_business_day(pool, context);

  for (const item of data.items) {
    const inventory_item_id = await find_inventory_item_id(pool, context.account_id, item.item_name);
    await pool.query(
      `
        INSERT INTO op_inventory_snapshots (
          account_id,
          organization_id,
          business_day_id,
          snapshot_type,
          item_name,
          inventory_item_id,
          quantity,
          unit,
          source_message_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        context.account_id,
        context.organization_id,
        business_day.id,
        data.snapshot_type,
        item.item_name,
        inventory_item_id,
        quantity_to_database(item.quantity),
        item.unit,
        context.source_message_id,
      ],
    );
  }

  return { business_day_id: business_day.id };
}
