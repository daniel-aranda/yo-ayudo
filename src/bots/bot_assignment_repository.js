export async function assign_bot_to_whatsapp_phone_number(pool, input) {
  await pool.query(
    `
      UPDATE phone_number_bot_assignments
      SET
        status = 'inactive',
        active_key = NULL,
        unassigned_at = now(),
        updated_at = now()
      WHERE whatsapp_phone_number_id = $1
        AND active_key = 'active'
        AND bot_id <> $2
    `,
    [input.whatsapp_phone_number_id, input.bot_id],
  );

  const result = await pool.query(
    `
      INSERT INTO phone_number_bot_assignments (
        organization_id,
        account_id,
        whatsapp_phone_number_id,
        bot_id,
        status,
        active_key,
        assignment_type,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, 'active', 'active', COALESCE($5, 'primary'), $6::jsonb)
      ON CONFLICT (whatsapp_phone_number_id, active_key)
      DO UPDATE SET
        organization_id = EXCLUDED.organization_id,
        account_id = EXCLUDED.account_id,
        bot_id = EXCLUDED.bot_id,
        status = 'active',
        assignment_type = EXCLUDED.assignment_type,
        metadata_json = EXCLUDED.metadata_json,
        unassigned_at = NULL,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id,
      input.account_id,
      input.whatsapp_phone_number_id,
      input.bot_id,
      input.assignment_type ?? "primary",
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  return result.rows[0];
}

export async function find_active_bot_assignment_by_phone_number_id(pool, phone_number_id) {
  const result = await pool.query(
    `
      SELECT
        phone_number_bot_assignments.*,
        whatsapp_phone_numbers.phone_number_id,
        whatsapp_phone_numbers.display_phone_number
      FROM phone_number_bot_assignments
      JOIN whatsapp_phone_numbers
        ON whatsapp_phone_numbers.id = phone_number_bot_assignments.whatsapp_phone_number_id
      WHERE whatsapp_phone_numbers.phone_number_id = $1
        AND whatsapp_phone_numbers.status = 'active'
        AND phone_number_bot_assignments.status = 'active'
        AND phone_number_bot_assignments.active_key = 'active'
      LIMIT 1
    `,
    [phone_number_id],
  );

  return result.rows[0] ?? null;
}
