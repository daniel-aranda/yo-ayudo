export async function create_agent_run(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO agent_runs (
        tenant_id,
        branch_id,
        contact_id,
        conversation_id,
        message_id,
        agent_profile_id,
        agent_key,
        run_type,
        input_json,
        retrieved_context_json,
        output_json,
        status,
        error_message,
        completed_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14
      )
      RETURNING *
    `,
    [
      input.tenant_id,
      input.branch_id ?? null,
      input.contact_id ?? null,
      input.conversation_id ?? null,
      input.message_id ?? null,
      input.agent_profile_id ?? null,
      input.agent_key,
      input.run_type,
      JSON.stringify(input.input_json ?? {}),
      JSON.stringify(input.retrieved_context_json ?? []),
      input.output_json === undefined ? null : JSON.stringify(input.output_json),
      input.status,
      input.error_message ?? null,
      input.completed_at ?? null,
    ],
  );

  return result.rows[0];
}
