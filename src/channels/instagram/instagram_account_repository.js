export async function upsert_instagram_account(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO instagram_accounts (
        organization_id,
        account_id,
        external_account_id,
        username,
        status
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))
      ON CONFLICT (external_account_id)
      DO UPDATE SET
        organization_id = COALESCE(EXCLUDED.organization_id, instagram_accounts.organization_id),
        account_id = COALESCE(EXCLUDED.account_id, instagram_accounts.account_id),
        username = EXCLUDED.username,
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.external_account_id,
      input.username ?? null,
      input.status ?? "active",
    ],
  );

  return result.rows[0];
}

export async function assign_bot_to_instagram_account(pool, input) {
  await pool.query(
    `
      UPDATE instagram_account_bot_assignments
      SET
        status = 'inactive',
        active_key = NULL,
        unassigned_at = now(),
        updated_at = now()
      WHERE instagram_account_id = $1
        AND active_key = 'active'
        AND bot_id <> $2
    `,
    [input.instagram_account_id, input.bot_id],
  );

  const result = await pool.query(
    `
      INSERT INTO instagram_account_bot_assignments (
        organization_id,
        account_id,
        instagram_account_id,
        bot_id,
        status,
        active_key,
        assignment_type,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, 'active', 'active', COALESCE($5, 'primary'), $6::jsonb)
      ON CONFLICT (instagram_account_id, active_key)
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
      input.instagram_account_id,
      input.bot_id,
      input.assignment_type ?? "primary",
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  return result.rows[0];
}
