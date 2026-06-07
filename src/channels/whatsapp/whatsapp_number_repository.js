export async function upsert_whatsapp_phone_number(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO whatsapp_phone_numbers (
        organization_id,
        account_id,
        phone_number_id,
        display_phone_number,
        status
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))
      ON CONFLICT (phone_number_id)
      DO UPDATE SET
        organization_id = COALESCE(EXCLUDED.organization_id, whatsapp_phone_numbers.organization_id),
        account_id = COALESCE(EXCLUDED.account_id, whatsapp_phone_numbers.account_id),
        display_phone_number = EXCLUDED.display_phone_number,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.phone_number_id,
      input.display_phone_number ?? null,
      input.status ?? "active",
    ],
  );

  return result.rows[0];
}

export async function find_whatsapp_phone_number_by_phone_number_id(pool, phone_number_id) {
  const result = await pool.query(
    `
      SELECT *
      FROM whatsapp_phone_numbers
      WHERE phone_number_id = $1
        AND status = 'active'
      LIMIT 1
    `,
    [phone_number_id],
  );

  return result.rows[0] ?? null;
}
