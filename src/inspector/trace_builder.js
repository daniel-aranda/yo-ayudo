import { compact_trace_summary } from "./inspector_presenter.js";

async function rows(pool, sql, params) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function operational_writes_for_message(pool, message) {
  const writes = [];
  const purchases = await rows(pool, "SELECT * FROM op_purchases WHERE source_message_id = $1 ORDER BY created_at", [
    message.id,
  ]);
  const sales_updates = await rows(
    pool,
    "SELECT * FROM op_sales_updates WHERE source_message_id = $1 ORDER BY created_at",
    [message.id],
  );
  const inventory_snapshots = await rows(
    pool,
    "SELECT * FROM op_inventory_snapshots WHERE source_message_id = $1 ORDER BY created_at",
    [message.id],
  );

  for (const purchase of purchases) {
    writes.push({ type: "purchase", data: purchase });
  }

  for (const sales_update of sales_updates) {
    writes.push({ type: "sales_update", data: sales_update });
  }

  for (const inventory_snapshot of inventory_snapshots) {
    writes.push({ type: "inventory_snapshot", data: inventory_snapshot });
  }

  if (["day_start", "daily_close", "daily_note", "report_request"].includes(message.parsed_intent)) {
    const business_days = await rows(
      pool,
      `
        SELECT *
        FROM op_business_days
        WHERE account_id = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [message.account_id],
    );

    for (const business_day of business_days) {
      writes.push({ type: "business_day", data: business_day });
      const reports = await rows(
        pool,
        "SELECT * FROM op_daily_reports WHERE business_day_id = $1 ORDER BY created_at DESC",
        [business_day.id],
      );

      for (const report of reports) {
        writes.push({ type: "daily_report", data: report });
      }
    }
  }

  const review_items = await rows(pool, "SELECT * FROM review_items WHERE message_id = $1 ORDER BY created_at", [
    message.id,
  ]);

  for (const review_item of review_items) {
    writes.push({ type: "review_item", data: review_item });
  }

  return writes;
}

export async function build_message_trace(pool, { message_id }) {
  const message_result = await pool.query(
    `
      SELECT
        messages.*,
        contacts.display_name AS contact_name,
        contacts.whatsapp_phone,
        bots.name AS bot_name,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM messages
      JOIN contacts ON contacts.id = messages.contact_id
      LEFT JOIN bots ON bots.id = messages.bot_id
      LEFT JOIN accounts ON accounts.id = COALESCE(messages.account_id, bots.account_id)
      LEFT JOIN organizations ON organizations.id = COALESCE(messages.organization_id, bots.organization_id)
      WHERE messages.id = $1
      LIMIT 1
    `,
    [message_id],
  );
  const message = message_result.rows[0];

  if (!message) {
    throw new Error(`Message not found: ${message_id}`);
  }

  const parsing_results = await rows(pool, "SELECT * FROM parsing_results WHERE message_id = $1 ORDER BY created_at", [
    message_id,
  ]);
  const router_runs = await rows(
    pool,
    "SELECT * FROM agent_runs WHERE message_id = $1 AND run_type = 'route' ORDER BY created_at",
    [message_id],
  );
  const agent_runs = await rows(
    pool,
    "SELECT * FROM agent_runs WHERE message_id = $1 AND run_type <> 'route' ORDER BY created_at",
    [message_id],
  );
  const memory_documents = await rows(
    pool,
    "SELECT * FROM memory_documents WHERE message_id = $1 ORDER BY created_at",
    [message_id],
  );
  const ai_calls = await rows(pool, "SELECT * FROM ai_calls WHERE message_id = $1 ORDER BY created_at", [message_id]);
  const review_items = await rows(pool, "SELECT * FROM review_items WHERE message_id = $1 ORDER BY created_at", [
    message_id,
  ]);
  const processing_events = await rows(
    pool,
    "SELECT * FROM processing_events WHERE message_id = $1 ORDER BY created_at",
    [message_id],
  );
  const action_logs = await rows(
    pool,
    "SELECT * FROM action_audit_logs WHERE message_id = $1 ORDER BY created_at",
    [message_id],
  );
  const outbound_responses = await rows(
    pool,
    `
      SELECT *
      FROM messages
      WHERE reply_to_message_id = $1
      ORDER BY created_at
    `,
    [message_id],
  );
  const trace = {
    message,
    parsing_results,
    guardrail_events: processing_events.filter((event) => event.event_stage === "guardrail"),
    routing_events: processing_events.filter((event) => event.event_type === "routing_decision"),
    router_runs,
    agent_runs,
    memory_documents,
    ai_calls,
    operational_writes: await operational_writes_for_message(pool, message),
    outbound_responses,
    review_items,
    processing_events,
    action_logs,
  };

  return {
    ...trace,
    compact_trace_summary: compact_trace_summary(trace),
  };
}

export async function compact_trace_for_message(pool, message) {
  const parsing_results = await rows(pool, "SELECT * FROM parsing_results WHERE message_id = $1 ORDER BY created_at", [
    message.id,
  ]);
  const router_runs = await rows(
    pool,
    "SELECT * FROM agent_runs WHERE message_id = $1 AND run_type = 'route' ORDER BY created_at",
    [message.id],
  );
  const agent_runs = await rows(pool, "SELECT * FROM agent_runs WHERE message_id = $1 ORDER BY created_at", [
    message.id,
  ]);
  const memory_documents = await rows(
    pool,
    "SELECT * FROM memory_documents WHERE message_id = $1 ORDER BY created_at",
    [message.id],
  );
  const review_items = await rows(pool, "SELECT * FROM review_items WHERE message_id = $1 ORDER BY created_at", [
    message.id,
  ]);
  const processing_events = await rows(
    pool,
    "SELECT * FROM processing_events WHERE message_id = $1 ORDER BY created_at",
    [message.id],
  );
  const action_logs = await rows(
    pool,
    "SELECT action_id, status, actor_type, output_json, metadata_json, created_at FROM action_audit_logs WHERE message_id = $1 ORDER BY created_at",
    [message.id],
  );

  return compact_trace_summary({
    message,
    parsing_results,
    router_runs,
    agent_runs,
    memory_documents,
    review_items,
    processing_events,
    action_logs,
  });
}
