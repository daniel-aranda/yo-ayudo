import { logger } from "../shared/logger.js";
import { generate_daily_report } from "../operations/reports/daily_report_generator.js";

export async function send_day_start_reminders() {
  logger.info("send_day_start_reminders job placeholder invoked");
}

export async function send_daily_close_reminders() {
  logger.info("send_daily_close_reminders job placeholder invoked");
}

export async function generate_daily_reports(pool) {
  const operations = await pool.query(
    `
      SELECT tenant_id, branch_id, operation_date::text
      FROM op_business_days
      WHERE NOT EXISTS (
        SELECT 1
        FROM op_daily_reports
        WHERE op_daily_reports.business_day_id = op_business_days.id
      )
      ORDER BY operation_date DESC
      LIMIT 50
    `,
  );

  for (const operation of operations.rows) {
    await generate_daily_report(pool, operation);
  }

  logger.info({ count: operations.rowCount }, "generate_daily_reports job completed");
  return operations.rowCount ?? 0;
}

export async function detect_missing_daily_data(pool) {
  const result = await pool.query(
    `
      INSERT INTO review_items (tenant_id, branch_id, message_id, reason, raw_text, extracted_json)
      SELECT
        op_business_days.tenant_id,
        op_business_days.branch_id,
        messages.id,
        'missing_daily_data',
        'Daily operation has missing critical data',
        jsonb_build_object('operation_date', op_business_days.operation_date)
      FROM op_business_days
      JOIN messages ON messages.tenant_id = op_business_days.tenant_id
      WHERE (op_business_days.opening_cash IS NULL OR op_business_days.total_sales IS NULL)
        AND messages.id = (
          SELECT id
          FROM messages
          WHERE messages.tenant_id = op_business_days.tenant_id
          ORDER BY created_at DESC
          LIMIT 1
        )
      LIMIT 20
    `,
  );

  logger.info({ count: result.rowCount }, "detect_missing_daily_data job completed");
  return result.rowCount ?? 0;
}

export async function retry_failed_outbound_messages() {
  logger.info("retry_failed_outbound_messages job placeholder invoked");
}
