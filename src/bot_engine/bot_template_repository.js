export async function list_bot_templates(pool, input = {}) {
  const values = [];
  const filters = [];

  if (!input.include_disabled) {
    filters.push("habilitado = true");
  }

  values.push(input.limit ?? 100);
  const result = await pool.query(
    `
      SELECT *
      FROM bot_templates
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY nombre
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows;
}

export async function get_bot_template(pool, template_id) {
  const result = await pool.query("SELECT * FROM bot_templates WHERE template_id = $1 LIMIT 1", [template_id]);
  return result.rows[0] ?? null;
}
