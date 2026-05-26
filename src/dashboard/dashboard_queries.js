import { today_key } from "../shared/dates.js";

export async function get_dashboard_home(pool) {
  const tenants = await pool.query(
    `
      SELECT
        tenants.id,
        tenants.name,
        tenants.slug,
        tenants.status,
        COUNT(branches.id) AS branch_count
      FROM tenants
      LEFT JOIN branches ON branches.tenant_id = tenants.id
      GROUP BY tenants.id
      ORDER BY tenants.created_at DESC
    `,
  );

  return { tenants: tenants.rows };
}

export async function get_tenant_dashboard_data(pool, tenant_id) {
  const tenant_result = await pool.query("SELECT * FROM tenants WHERE id = $1", [tenant_id]);
  const branches = await pool.query(
    `
      SELECT
        branches.*,
        MAX(op_business_days.operation_date) AS last_operation_date
      FROM branches
      LEFT JOIN op_business_days ON op_business_days.branch_id = branches.id
      WHERE branches.tenant_id = $1
      GROUP BY branches.id
      ORDER BY branches.name
    `,
    [tenant_id],
  );

  return {
    tenant: tenant_result.rows[0] ?? null,
    branches: branches.rows,
  };
}

export async function get_default_branch_date(pool, input) {
  const branch_result = await pool.query(
    "SELECT timezone FROM branches WHERE tenant_id = $1 AND id = $2",
    [input.tenant_id, input.branch_id],
  );
  return today_key(branch_result.rows[0]?.timezone ?? "America/Mexico_City");
}

export async function get_branch_dashboard_data(pool, input) {
  const tenant_result = await pool.query("SELECT * FROM tenants WHERE id = $1", [input.tenant_id]);
  const branch_result = await pool.query(
    "SELECT * FROM branches WHERE tenant_id = $1 AND id = $2",
    [input.tenant_id, input.branch_id],
  );
  const operation_result = await pool.query(
    `
      SELECT *
      FROM op_business_days
      WHERE tenant_id = $1 AND branch_id = $2 AND operation_date = $3
      LIMIT 1
    `,
    [input.tenant_id, input.branch_id, input.operation_date],
  );
  const operation = operation_result.rows[0] ?? null;
  const business_day_id = operation?.id ?? null;
  const purchases = business_day_id
    ? await pool.query(
        `
          SELECT *
          FROM op_purchases
          WHERE business_day_id = $1
          ORDER BY created_at DESC
        `,
        [business_day_id],
      )
    : { rows: [] };
  const purchase_totals = business_day_id
    ? await pool.query(
        `
          SELECT COALESCE(SUM(total_cost), 0) AS total_purchases
          FROM op_purchases
          WHERE business_day_id = $1
        `,
        [business_day_id],
      )
    : { rows: [{ total_purchases: 0 }] };
  const inventory = business_day_id
    ? await pool.query(
        `
          SELECT *
          FROM op_inventory_snapshots
          WHERE business_day_id = $1
          ORDER BY snapshot_type, item_name
        `,
        [business_day_id],
      )
    : { rows: [] };
  const messages = await pool.query(
    `
      SELECT
        messages.id,
        messages.direction,
        messages.text_body,
        messages.parsed_intent,
        messages.confidence,
        messages.needs_review,
        messages.processing_status,
        messages.created_at
      FROM messages
      WHERE messages.tenant_id = $1
        AND (messages.branch_id = $2 OR messages.branch_id IS NULL)
      ORDER BY messages.created_at DESC
      LIMIT 20
    `,
    [input.tenant_id, input.branch_id],
  );
  const review_items = await pool.query(
    `
      SELECT *
      FROM review_items
      WHERE tenant_id = $1
        AND (branch_id = $2 OR branch_id IS NULL)
        AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 20
    `,
    [input.tenant_id, input.branch_id],
  );
  const report = business_day_id
    ? await pool.query(
        `
          SELECT *
          FROM op_daily_reports
          WHERE business_day_id = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [business_day_id],
      )
    : { rows: [] };

  return {
    tenant: tenant_result.rows[0] ?? null,
    branch: branch_result.rows[0] ?? null,
    operation_date: input.operation_date,
    operation,
    purchases: purchases.rows,
    total_purchases: purchase_totals.rows[0]?.total_purchases ?? 0,
    inventory: inventory.rows,
    messages: messages.rows,
    review_items: review_items.rows,
    report: report.rows[0] ?? null,
  };
}
