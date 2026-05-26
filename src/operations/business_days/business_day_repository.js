import { money_to_database } from "../../shared/money.js";

export async function ensure_business_day(pool, identity) {
  const result = await pool.query(
    `
      INSERT INTO op_business_days (tenant_id, branch_id, operation_date, status)
      VALUES ($1, $2, $3, 'open')
      ON CONFLICT (tenant_id, branch_id, operation_date)
      DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [identity.tenant_id, identity.branch_id, identity.operation_date],
  );

  return result.rows[0];
}

export async function record_day_start(pool, context, data) {
  const business_day = await ensure_business_day(pool, context);
  await pool.query(
    `
      UPDATE op_business_days
      SET
        opening_cash = $2,
        free_comment = COALESCE($3, free_comment),
        status = 'open',
        opened_at = COALESCE(opened_at, now()),
        updated_at = now()
      WHERE id = $1
    `,
    [business_day.id, money_to_database(data.opening_cash), data.free_comment ?? null],
  );

  return { business_day_id: business_day.id };
}
