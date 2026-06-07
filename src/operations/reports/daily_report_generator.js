import {
  build_daily_summary,
  calculate_daily_metrics,
  detect_daily_alerts,
} from "./operational_rules.js";

export async function generate_daily_report(pool, input) {
  const operation_result = await pool.query(
    `
      SELECT *
      FROM op_business_days
      WHERE account_id = $1 AND operation_date = $2
      LIMIT 1
    `,
    [input.account_id, input.operation_date],
  );
  const operation = operation_result.rows[0];

  if (!operation) {
    throw new Error("Cannot generate report without a business day");
  }

  const purchases_result = await pool.query(
    "SELECT total_cost FROM op_purchases WHERE business_day_id = $1",
    [operation.id],
  );
  const metrics = calculate_daily_metrics(operation, purchases_result.rows);
  const alerts = detect_daily_alerts(operation, metrics);
  const summary_text = build_daily_summary(metrics, alerts);
  const report_result = await pool.query(
    `
      INSERT INTO op_daily_reports (
        account_id,
        organization_id,
        business_day_id,
        report_date,
        summary_text,
        metrics_json,
        alerts_json,
        recommendations_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      input.account_id,
      input.organization_id,
      operation.id,
      input.operation_date,
      summary_text,
      JSON.stringify(metrics),
      JSON.stringify(alerts),
      JSON.stringify([]),
    ],
  );

  return {
    id: report_result.rows[0].id,
    summary_text,
    metrics,
    alerts,
  };
}
