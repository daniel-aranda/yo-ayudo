export async function create_agent_run(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO agent_runs (
        account_id,
        organization_id,
        contact_id,
        conversation_id,
        message_id,
        bot_id,
        agent_profile_id,
        agent_key,
        run_type,
        input_json,
        retrieved_context_json,
        output_json,
        selected_agent_id,
        selected_agent_name,
        selected_agent_type,
        routing_reason,
        routing_confidence,
        routing_candidates_json,
        used_context_summary_json,
        handoff_recommended,
        handoff_reason,
        status,
        error_message,
        completed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10::jsonb, $11::jsonb, $12::jsonb,
        $13, $14, $15, $16, $17, $18::jsonb, $19::jsonb, $20, $21,
        $22, $23, $24
      )
      RETURNING *
    `,
    [
      input.account_id ?? null,
      input.organization_id ?? null,
      input.contact_id ?? null,
      input.conversation_id ?? null,
      input.message_id ?? null,
      input.bot_id ?? null,
      input.agent_profile_id ?? null,
      input.agent_key,
      input.run_type,
      JSON.stringify(input.input_json ?? {}),
      JSON.stringify(input.retrieved_context_json ?? []),
      input.output_json === undefined ? null : JSON.stringify(input.output_json),
      input.selected_agent_id ?? null,
      input.selected_agent_name ?? null,
      input.selected_agent_type ?? null,
      input.routing_reason ?? null,
      input.routing_confidence ?? null,
      JSON.stringify(input.routing_candidates_json ?? []),
      JSON.stringify(input.used_context_summary_json ?? {}),
      input.handoff_recommended ?? false,
      input.handoff_reason ?? null,
      input.status,
      input.error_message ?? null,
      input.completed_at ?? null,
    ],
  );

  return result.rows[0];
}
