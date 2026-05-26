import { money_to_database } from "../../shared/money.js";
import { ensure_business_day } from "../business_days/business_day_repository.js";

export async function record_sales_update(pool, context, data) {
  const business_day = await ensure_business_day(pool, context);

  await pool.query(
    `
      INSERT INTO op_sales_updates (
        tenant_id,
        branch_id,
        business_day_id,
        accumulated_sales,
        cash_sales,
        card_sales,
        transfer_sales,
        delivery_app_sales,
        note,
        source_message_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
    [
      context.tenant_id,
      context.branch_id,
      business_day.id,
      money_to_database(data.accumulated_sales),
      money_to_database(data.cash_sales),
      money_to_database(data.card_sales),
      money_to_database(data.transfer_sales),
      money_to_database(data.delivery_app_sales),
      data.note ?? null,
      context.source_message_id,
    ],
  );

  await pool.query(
    `
      UPDATE op_business_days
      SET
        total_sales = $2,
        cash_sales = COALESCE($3, cash_sales),
        card_sales = COALESCE($4, card_sales),
        transfer_sales = COALESCE($5, transfer_sales),
        delivery_app_sales = COALESCE($6, delivery_app_sales),
        updated_at = now()
      WHERE id = $1
    `,
    [
      business_day.id,
      money_to_database(data.accumulated_sales),
      money_to_database(data.cash_sales),
      money_to_database(data.card_sales),
      money_to_database(data.transfer_sales),
      money_to_database(data.delivery_app_sales),
    ],
  );

  return { business_day_id: business_day.id };
}
