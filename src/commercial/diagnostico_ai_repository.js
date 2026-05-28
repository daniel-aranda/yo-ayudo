export async function create_diagnostico_ai(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO diagnosticos_ai (
        organization_id,
        account_id,
        prospecto_id,
        negocio_nombre,
        giro,
        contacto_nombre,
        contacto_telefono,
        contacto_email,
        vendedor_id,
        precio_diagnostico,
        moneda,
        pagado,
        acreditable,
        status,
        respuestas_entrevista,
        problemas_detectados,
        oportunidades_ai,
        bots_recomendados,
        paquete_recomendado,
        acciones_recomendadas,
        precio_mensual_sugerido,
        propuesta_resumen
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        COALESCE($10, 400), COALESCE($11, 'MXN'), COALESCE($12, false), COALESCE($13, true),
        COALESCE($14, 'nuevo'), $15::jsonb, $16::jsonb, $17::jsonb, $18::jsonb, $19, $20::jsonb, $21, $22::jsonb
      )
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.prospecto_id ?? null,
      input.negocio_nombre,
      input.giro ?? null,
      input.contacto_nombre ?? null,
      input.contacto_telefono ?? null,
      input.contacto_email ?? null,
      input.vendedor_id ?? null,
      input.precio_diagnostico ?? 400,
      input.moneda ?? "MXN",
      input.pagado ?? false,
      input.acreditable ?? true,
      input.status ?? "nuevo",
      JSON.stringify(input.respuestas_entrevista ?? {}),
      JSON.stringify(input.problemas_detectados ?? []),
      JSON.stringify(input.oportunidades_ai ?? []),
      JSON.stringify(input.bots_recomendados ?? []),
      input.paquete_recomendado ?? null,
      JSON.stringify(input.acciones_recomendadas ?? []),
      input.precio_mensual_sugerido ?? null,
      JSON.stringify(input.propuesta_resumen ?? {}),
    ],
  );

  return result.rows[0];
}

export async function get_diagnostico_ai(pool, diagnostico_id) {
  const result = await pool.query("SELECT * FROM diagnosticos_ai WHERE diagnostico_id = $1 LIMIT 1", [diagnostico_id]);
  return result.rows[0] ?? null;
}

export async function list_diagnosticos_ai(pool, input = {}) {
  const filters = [];
  const values = [];

  function add_filter(sql, value) {
    values.push(value);
    filters.push(sql.replace("?", `$${values.length}`));
  }

  if (input.organization_id) {
    add_filter("organization_id = ?", input.organization_id);
  }

  if (input.account_id) {
    add_filter("account_id = ?", input.account_id);
  }

  if (input.vendedor_id) {
    add_filter("vendedor_id = ?", input.vendedor_id);
  }

  if (input.status) {
    add_filter("status = ?", input.status);
  }

  values.push(input.limit ?? 100);
  const result = await pool.query(
    `
      SELECT *
      FROM diagnosticos_ai
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows;
}

export async function update_diagnostico_ai(pool, diagnostico_id, patch) {
  const current = await get_diagnostico_ai(pool, diagnostico_id);

  if (!current) {
    return null;
  }

  const next = {
    ...current,
    ...patch,
  };
  const result = await pool.query(
    `
      UPDATE diagnosticos_ai
      SET
        account_id = $2,
        prospecto_id = $3,
        negocio_nombre = $4,
        giro = $5,
        contacto_nombre = $6,
        contacto_telefono = $7,
        contacto_email = $8,
        vendedor_id = $9,
        precio_diagnostico = $10,
        moneda = $11,
        pagado = $12,
        acreditable = $13,
        status = $14,
        respuestas_entrevista = $15::jsonb,
        problemas_detectados = $16::jsonb,
        oportunidades_ai = $17::jsonb,
        bots_recomendados = $18::jsonb,
        paquete_recomendado = $19,
        acciones_recomendadas = $20::jsonb,
        precio_mensual_sugerido = $21,
        propuesta_resumen = $22::jsonb,
        updated_at = now()
      WHERE diagnostico_id = $1
      RETURNING *
    `,
    [
      diagnostico_id,
      next.account_id ?? null,
      next.prospecto_id ?? null,
      next.negocio_nombre,
      next.giro ?? null,
      next.contacto_nombre ?? null,
      next.contacto_telefono ?? null,
      next.contacto_email ?? null,
      next.vendedor_id ?? null,
      next.precio_diagnostico ?? 400,
      next.moneda ?? "MXN",
      next.pagado ?? false,
      next.acreditable ?? true,
      next.status ?? "nuevo",
      JSON.stringify(next.respuestas_entrevista ?? {}),
      JSON.stringify(next.problemas_detectados ?? []),
      JSON.stringify(next.oportunidades_ai ?? []),
      JSON.stringify(next.bots_recomendados ?? []),
      next.paquete_recomendado ?? null,
      JSON.stringify(next.acciones_recomendadas ?? []),
      next.precio_mensual_sugerido ?? null,
      JSON.stringify(next.propuesta_resumen ?? {}),
    ],
  );

  return result.rows[0];
}
