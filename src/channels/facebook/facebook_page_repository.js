// Páginas de Facebook (canal Messenger), espejo de instagram_account_repository.
// Una org/cuenta posee páginas; cada una se asigna a un bot activo a la vez.

export async function upsert_facebook_page(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO facebook_pages (
        organization_id,
        account_id,
        external_page_id,
        page_name,
        access_token,
        status
      )
      VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'active'))
      ON CONFLICT (external_page_id)
      DO UPDATE SET
        organization_id = COALESCE(EXCLUDED.organization_id, facebook_pages.organization_id),
        account_id = COALESCE(EXCLUDED.account_id, facebook_pages.account_id),
        page_name = EXCLUDED.page_name,
        access_token = COALESCE(EXCLUDED.access_token, facebook_pages.access_token),
        status = EXCLUDED.status,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.external_page_id,
      input.page_name ?? null,
      input.access_token ?? null,
      input.status ?? "active",
    ],
  );

  return result.rows[0];
}

export async function assign_bot_to_facebook_page(pool, input) {
  await pool.query(
    `
      UPDATE facebook_page_bot_assignments
      SET
        status = 'inactive',
        active_key = NULL,
        unassigned_at = now(),
        updated_at = now()
      WHERE facebook_page_id = $1
        AND active_key = 'active'
        AND bot_id <> $2
    `,
    [input.facebook_page_id, input.bot_id],
  );

  const result = await pool.query(
    `
      INSERT INTO facebook_page_bot_assignments (
        organization_id,
        account_id,
        facebook_page_id,
        bot_id,
        status,
        active_key,
        assignment_type,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, 'active', 'active', COALESCE($5, 'primary'), $6::jsonb)
      ON CONFLICT (facebook_page_id, active_key)
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
      input.facebook_page_id,
      input.bot_id,
      input.assignment_type ?? "primary",
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  return result.rows[0];
}
