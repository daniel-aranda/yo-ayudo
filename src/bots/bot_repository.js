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
        bot_type,
        status,
        description,
        settings_json,
        definition_json,
        definition_version,
        created_by_user_id,
        paquete_id,
        enabled_actions_json,
        reglas_escalamiento_json,
        campos_requeridos_json
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, COALESCE($7, 'whatsapp'),
        COALESCE($8, 'system'), COALESCE($9, 'active'), $10,
        $11::jsonb, $12::jsonb, COALESCE($13, 1), $14,
        $15, $16::jsonb, $17::jsonb, $18::jsonb
      )
      ON CONFLICT (account_id, slug)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        bot_profile_id = EXCLUDED.bot_profile_id,
        name = EXCLUDED.name,
        channel = EXCLUDED.channel,
        bot_type = EXCLUDED.bot_type,
        status = EXCLUDED.status,
        description = EXCLUDED.description,
        settings_json = EXCLUDED.settings_json,
        definition_json = EXCLUDED.definition_json,
        definition_version = EXCLUDED.definition_version,
        created_by_user_id = COALESCE(EXCLUDED.created_by_user_id, bots.created_by_user_id),
        paquete_id = EXCLUDED.paquete_id,
        enabled_actions_json = EXCLUDED.enabled_actions_json,
        reglas_escalamiento_json = EXCLUDED.reglas_escalamiento_json,
        campos_requeridos_json = EXCLUDED.campos_requeridos_json,
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
      input.bot_type ?? "system",
      input.status ?? "active",
      input.description ?? null,
      JSON.stringify(input.settings_json ?? {}),
      JSON.stringify(input.definition_json ?? {}),
      input.definition_version ?? 1,
      input.created_by_user_id ?? null,
      input.paquete_id ?? null,
      JSON.stringify(input.enabled_actions_json ?? []),
      JSON.stringify(input.reglas_escalamiento_json ?? []),
      JSON.stringify(input.campos_requeridos_json ?? []),
    ],
  );

  return result.rows[0];
}

export async function get_bot_by_id(pool, bot_id) {
  const result = await pool.query("SELECT * FROM bots WHERE id = $1 LIMIT 1", [bot_id]);
  return result.rows[0] ?? null;
}

export async function get_bot_with_definition(pool, bot_id) {
  const result = await pool.query(
    `
      SELECT
        bots.*,
        accounts.name AS account_name,
        organizations.name AS organization_name
      FROM bots
      JOIN accounts ON accounts.id = bots.account_id
      JOIN organizations ON organizations.id = bots.organization_id
      WHERE bots.id = $1
      LIMIT 1
    `,
    [bot_id],
  );

  return result.rows[0] ?? null;
}

export async function list_bots_by_account(pool, account_id) {
  const result = await pool.query(
    `
      SELECT *
      FROM bots
      WHERE account_id = $1
      ORDER BY bot_type, name
    `,
    [account_id],
  );

  return result.rows;
}

export async function update_bot_status(pool, input) {
  const result = await pool.query(
    `
      UPDATE bots
      SET status = $2, updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [input.bot_id, input.status],
  );

  return result.rows[0] ?? null;
}
