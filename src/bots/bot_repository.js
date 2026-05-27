export async function upsert_bot(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO bots (
        organization_id,
        account_id,
        tenant_id,
        bot_profile_id,
        name,
        slug,
        channel,
        status,
        settings_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'whatsapp'), COALESCE($8, 'active'), $9::jsonb)
      ON CONFLICT (account_id, slug)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        bot_profile_id = EXCLUDED.bot_profile_id,
        name = EXCLUDED.name,
        channel = EXCLUDED.channel,
        status = EXCLUDED.status,
        settings_json = EXCLUDED.settings_json,
        updated_at = now()
      RETURNING *
    `,
    [
      input.organization_id,
      input.account_id,
      input.tenant_id,
      input.bot_profile_id ?? null,
      input.name,
      input.slug,
      input.channel ?? "whatsapp",
      input.status ?? "active",
      JSON.stringify(input.settings_json ?? {}),
    ],
  );

  return result.rows[0];
}

export async function get_bot_by_id(pool, bot_id) {
  const result = await pool.query("SELECT * FROM bots WHERE id = $1 LIMIT 1", [bot_id]);
  return result.rows[0] ?? null;
}
