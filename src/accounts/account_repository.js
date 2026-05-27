export async function upsert_account(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO accounts (organization_id, tenant_id, name, slug, status)
      VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))
      ON CONFLICT (organization_id, slug)
      DO UPDATE SET
        tenant_id = COALESCE(EXCLUDED.tenant_id, accounts.tenant_id),
        name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id,
      input.tenant_id ?? null,
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
