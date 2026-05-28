export async function create_action_audit_log(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO action_audit_logs (
        organization_id,
        account_id,
        bot_id,
        conversation_id,
        message_id,
        action_id,
        status,
        input_json,
        output_json,
        error,
        actor_type,
        actor_id,
        confirmation_required,
        confirmed_by,
        confirmed_at,
        metadata_json
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8::jsonb, $9::jsonb, $10, $11, $12, $13, $14, $15, $16::jsonb
      )
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.bot_id ?? null,
      input.conversation_id ?? null,
      input.message_id ?? null,
      input.action_id,
      input.status,
      JSON.stringify(input.input_json ?? {}),
      JSON.stringify(input.output_json ?? {}),
      input.error ?? null,
      input.actor_type ?? "system",
      input.actor_id ?? null,
      input.confirmation_required ?? false,
      input.confirmed_by ?? null,
      input.confirmed_at ?? null,
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  return result.rows[0];
}

export async function list_action_audit_logs(pool, input = {}) {
  const filters = [];
  const values = [];

  function add_filter(sql, value) {
    values.push(value);
    filters.push(sql.replace("?", `$${values.length}`));
  }

  if (input.organization_id) {
    add_filter("organization_id = ?", input.organization_id);
  }

  if (input.account_id) {
    add_filter("account_id = ?", input.account_id);
  }

  if (input.bot_id) {
    add_filter("bot_id = ?", input.bot_id);
  }

  if (input.action_id) {
    add_filter("action_id = ?", input.action_id);
  }

  values.push(input.limit ?? 100);
  const result = await pool.query(
    `
      SELECT *
      FROM action_audit_logs
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows;
}
