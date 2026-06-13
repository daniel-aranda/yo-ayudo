function normalize_email(email) {
  return String(email ?? "").trim().toLowerCase();
}

export async function get_user_by_email(pool, email) {
  const result = await pool.query(
    `
      SELECT *
      FROM users
      WHERE email = $1
        AND status = 'active'
      LIMIT 1
    `,
    [normalize_email(email)],
  );

  return result.rows[0] ?? null;
}

export async function get_user_by_id(pool, user_id) {
  const result = await pool.query(
    `
      SELECT *
      FROM users
      WHERE id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [user_id],
  );

  return result.rows[0] ?? null;
}

export async function list_users_by_organization(pool, organization_id) {
  const result = await pool.query(
    `
      SELECT id, organization_id, name, email, role, status
      FROM users
      WHERE organization_id = $1
        AND status = 'active'
      ORDER BY name
    `,
    [organization_id],
  );

  return result.rows;
}

// Emails se guardan normalizados (minúsculas) y la unicidad se valida aquí:
// no hay unique constraint en DB (la tabla es legacy y pg-mem corre las
// migraciones tal cual). Carrera teórica aceptable en esta etapa.
export async function create_user(pool, input) {
  const email = normalize_email(input.email);
  const name = String(input.name ?? "").trim();

  if (!email || !name) {
    const error = new Error("Nombre y email son obligatorios.");
    error.code = "user_missing_fields";
    throw error;
  }

  const existing = await get_user_by_email(pool, email);

  if (existing) {
    const error = new Error(`Ya existe un usuario con el email ${email}.`);
    error.code = "user_email_taken";
    throw error;
  }

  const result = await pool.query(
    `
      INSERT INTO users (organization_id, name, email, role, status, password_hash, is_platform_owner)
      VALUES ($1, $2, $3, $4, 'active', $5, $6)
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      name,
      email,
      input.role ?? "member",
      input.password_hash ?? null,
      input.is_platform_owner ?? false,
    ],
  );

  return result.rows[0];
}
