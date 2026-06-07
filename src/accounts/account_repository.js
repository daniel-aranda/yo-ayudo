export async function upsert_account(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO accounts (organization_id, name, slug, status)
      VALUES ($1, $2, $3, COALESCE($4, 'active'))
      ON CONFLICT (organization_id, slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id,
      input.name,
      input.slug,
      input.status ?? "active",
    ],
  );

  return result.rows[0];
}

export async function get_account_by_id(pool, account_id) {
  const result = await pool.query("SELECT * FROM accounts WHERE id = $1 LIMIT 1", [account_id]);
  return result.rows[0] ?? null;
}
