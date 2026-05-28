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
        campos_requeridos_json,
        prompt_base,
        instrucciones_operativas,
        tono,
        objetivos_json,
        knowledge_base_ids_json,
        acciones_habilitadas_json,
        reglas_guardrail_json,
        memoria_habilitada
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, COALESCE($7, 'whatsapp'),
        COALESCE($8, 'system'), COALESCE($9, 'active'), $10,
        $11::jsonb, $12::jsonb, COALESCE($13, 1), $14,
        $15, $16::jsonb, $17::jsonb, $18::jsonb,
        $19, $20, $21, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb, COALESCE($26, true)
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
        prompt_base = EXCLUDED.prompt_base,
        instrucciones_operativas = EXCLUDED.instrucciones_operativas,
        tono = EXCLUDED.tono,
        objetivos_json = EXCLUDED.objetivos_json,
        knowledge_base_ids_json = EXCLUDED.knowledge_base_ids_json,
        acciones_habilitadas_json = EXCLUDED.acciones_habilitadas_json,
        reglas_guardrail_json = EXCLUDED.reglas_guardrail_json,
        memoria_habilitada = EXCLUDED.memoria_habilitada,
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
      JSON.stringify(input.enabled_actions_json ?? input.acciones_habilitadas_json ?? []),
      JSON.stringify(input.reglas_escalamiento_json ?? []),
      JSON.stringify(input.campos_requeridos_json ?? []),
      input.prompt_base ?? null,
      input.instrucciones_operativas ?? null,
      input.tono ?? null,
      JSON.stringify(input.objetivos_json ?? []),
      JSON.stringify(input.knowledge_base_ids_json ?? []),
      JSON.stringify(input.acciones_habilitadas_json ?? input.enabled_actions_json ?? []),
      JSON.stringify(input.reglas_guardrail_json ?? []),
      input.memoria_habilitada ?? true,
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

export async function update_bot_configuration(pool, bot_id, patch) {
  const current = await get_bot_by_id(pool, bot_id);

  if (!current) {
    return null;
  }

  const next = {
    ...current,
    ...patch,
  };
  const result = await pool.query(
    `
      UPDATE bots
      SET
        name = $2,
        description = $3,
        status = $4,
        prompt_base = $5,
        instrucciones_operativas = $6,
        tono = $7,
        objetivos_json = $8::jsonb,
        knowledge_base_ids_json = $9::jsonb,
        acciones_habilitadas_json = $10::jsonb,
        enabled_actions_json = $10::jsonb,
        reglas_guardrail_json = $11::jsonb,
        reglas_escalamiento_json = $12::jsonb,
        campos_requeridos_json = $13::jsonb,
        memoria_habilitada = $14,
        definition_json = $15::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [
      bot_id,
      next.name,
      next.description ?? null,
      next.status,
      next.prompt_base ?? null,
      next.instrucciones_operativas ?? null,
      next.tono ?? null,
      JSON.stringify(next.objetivos_json ?? []),
      JSON.stringify(next.knowledge_base_ids_json ?? []),
      JSON.stringify(next.acciones_habilitadas_json ?? next.enabled_actions_json ?? []),
      JSON.stringify(next.reglas_guardrail_json ?? []),
      JSON.stringify(next.reglas_escalamiento_json ?? []),
      JSON.stringify(next.campos_requeridos_json ?? []),
      next.memoria_habilitada ?? true,
      JSON.stringify(next.definition_json ?? {}),
    ],
  );

  return result.rows[0] ?? null;
}
