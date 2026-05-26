import { money_to_database } from "../../shared/money.js";
import { ensure_business_day } from "../business_days/business_day_repository.js";

export async function record_daily_close(pool, context, data) {
  const business_day = await ensure_business_day(pool, context);

  await pool.query(
    `
      UPDATE op_business_days
      SET
        status = 'closed',
        total_sales = $2,
        cash_sales = COALESCE($3, cash_sales),
        card_sales = COALESCE($4, card_sales),
        transfer_sales = COALESCE($5, transfer_sales),
        delivery_app_sales = COALESCE($6, delivery_app_sales),
        closing_cash = COALESCE($7, closing_cash),
        cash_withdrawals = COALESCE($8, cash_withdrawals),
        cash_payments = COALESCE($9, cash_payments),
        comps_amount = COALESCE($10, comps_amount),
        internal_consumption_amount = COALESCE($11, internal_consumption_amount),
        credit_sales_amount = COALESCE($12, credit_sales_amount),
        cancellations_amount = COALESCE($13, cancellations_amount),
        waste_notes = COALESCE($14, waste_notes),
        shortage_notes = COALESCE($15, shortage_notes),
        surplus_notes = COALESCE($16, surplus_notes),
        free_comment = COALESCE($17, free_comment),
        closed_at = COALESCE(closed_at, now()),
        updated_at = now()
      WHERE id = $1
    `,
    [
      business_day.id,
      money_to_database(data.total_sales),
      money_to_database(data.cash_sales),
      money_to_database(data.card_sales),
      money_to_database(data.transfer_sales),
      money_to_database(data.delivery_app_sales),
      money_to_database(data.closing_cash),
      money_to_database(data.cash_withdrawals),
      money_to_database(data.cash_payments),
      money_to_database(data.comps_amount),
      money_to_database(data.internal_consumption_amount),
      money_to_database(data.credit_sales_amount),
      money_to_database(data.cancellations_amount),
      data.waste_notes ?? null,
      data.shortage_notes ?? null,
      data.surplus_notes ?? null,
      data.free_comment ?? null,
    ],
  );

  return { business_day_id: business_day.id };
}
