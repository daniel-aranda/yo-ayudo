export async function create_bot_guardrail_event(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO bot_guardrail_events (
        organization_id,
        account_id,
        bot_id,
        conversation_id,
        tipo,
        action_id,
        accion_sugerida,
        descripcion,
        prompt_fragment,
        input_intentado,
        severidad,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, COALESCE($11, 'media'), COALESCE($12, 'nuevo'))
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.bot_id ?? null,
      input.conversation_id ?? null,
      input.tipo,
      input.action_id ?? null,
      input.accion_sugerida ?? null,
      input.descripcion,
      input.prompt_fragment ?? null,
      JSON.stringify(input.input_intentado ?? {}),
      input.severidad ?? "media",
      input.status ?? "nuevo",
    ],
  );

  return result.rows[0];
}

export async function list_bot_guardrail_events(pool, input = {}) {
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

  if (input.tipo) {
    add_filter("tipo = ?", input.tipo);
  }

  if (input.status) {
    add_filter("status = ?", input.status);
  }

  values.push(input.limit ?? 100);
  const result = await pool.query(
    `
      SELECT *
      FROM bot_guardrail_events
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows;
}
