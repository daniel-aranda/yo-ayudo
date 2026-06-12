const VALID_STATUSES = ["active", "paused", "archived"];

export function is_valid_entity_status(status) {
  return VALID_STATUSES.includes(status);
}

export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function create_organization(pool, input) {
  const slug = input.slug || slugify(input.name);
  const result = await pool.query(
    `
      INSERT INTO organizations (name, slug, status)
      VALUES ($1, $2, COALESCE($3, 'active'))
      ON CONFLICT (slug)
      DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status, updated_at = now()
      RETURNING *
    `,
    [input.name, slug, input.status ?? "active"],
  );

  return result.rows[0];
}

export async function set_organization_status(pool, organization_id, status) {
  const result = await pool.query(
    "UPDATE organizations SET status = $2, updated_at = now() WHERE id = $1 RETURNING *",
    [organization_id, status],
  );
  return result.rows[0] ?? null;
}

export async function set_account_status(pool, account_id, status) {
  const result = await pool.query(
    "UPDATE accounts SET status = $2, updated_at = now() WHERE id = $1 RETURNING *",
    [account_id, status],
  );
  return result.rows[0] ?? null;
}
