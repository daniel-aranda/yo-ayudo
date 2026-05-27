export async function create_processing_event(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO processing_events (
        organization_id,
        account_id,
        bot_id,
        tenant_id,
        branch_id,
        conversation_id,
        message_id,
        event_type,
        event_stage,
        status,
        title,
        summary,
        details_json,
        source_table,
        source_id,
        started_at,
        completed_at,
        duration_ms
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13::jsonb,
        $14, $15, $16, $17, $18
      )
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.bot_id ?? null,
      input.tenant_id ?? null,
      input.branch_id ?? null,
      input.conversation_id ?? null,
      input.message_id ?? null,
      input.event_type,
      input.event_stage,
      input.status ?? "success",
      input.title ?? null,
      input.summary ?? null,
      JSON.stringify(input.details_json ?? {}),
      input.source_table ?? null,
      input.source_id ?? null,
      input.started_at ?? null,
      input.completed_at ?? null,
      input.duration_ms ?? null,
    ],
  );

  return result.rows[0];
}
