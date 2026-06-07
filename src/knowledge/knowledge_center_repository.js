function clean_string(value) {
  return String(value ?? "").trim();
}

export async function list_knowledge_sources(pool, input = {}) {
  const filters = ["source_family = 'business_knowledge'", "status != 'archived'"];
  const values = [];

  if (input.account_id) {
    values.push(input.account_id);
    filters.push(`account_id = $${values.length}`);
  } else if (input.organization_id) {
    values.push(input.organization_id);
    filters.push(`organization_id = $${values.length}`);
  }

  values.push(input.limit ?? 100);

  const result = await pool.query(
    `
      SELECT *
      FROM knowledge_sources
      WHERE ${filters.join(" AND ")}
      ORDER BY updated_at DESC, name
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows;
}

export async function get_knowledge_source(pool, source_id) {
  const result = await pool.query(
    `
      SELECT *
      FROM knowledge_sources
      WHERE id = $1
        AND source_family = 'business_knowledge'
      LIMIT 1
    `,
    [source_id],
  );

  return result.rows[0] ?? null;
}

export async function update_knowledge_source(pool, source_id, input) {
  const name = clean_string(input.name);

  if (!name) {
    throw new Error("Knowledge source name is required.");
  }

  const result = await pool.query(
    `
      UPDATE knowledge_sources
      SET
        name = $2,
        description = $3,
        summary = $4,
        status = $5,
        summary_status = $6,
        metadata_json = $7::jsonb,
        updated_at = now()
      WHERE id = $1
        AND source_family = 'business_knowledge'
      RETURNING *
    `,
    [
      source_id,
      name,
      clean_string(input.description) || null,
      clean_string(input.summary) || null,
      clean_string(input.status) || "ready",
      clean_string(input.summary_status) || "ready",
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  return result.rows[0] ?? null;
}

export async function create_knowledge_source(pool, input) {
  const name = clean_string(input.name);

  if (!name) {
    throw new Error("Knowledge source name is required.");
  }

  const result = await pool.query(
    `
      INSERT INTO knowledge_sources (
        organization_id,
        account_id,
        bot_id,
        source_family,
        scope,
        source_type,
        name,
        description,
        summary,
        quick_facts,
        summary_status,
        origin,
        metadata_json,
        status
      )
      VALUES ($1, $2, $3, 'business_knowledge', $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12::jsonb, 'ready')
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.bot_id ?? null,
      input.scope ?? "account",
      input.source_type,
      name,
      clean_string(input.description) || null,
      clean_string(input.summary) || clean_string(input.content) || null,
      JSON.stringify(input.quick_facts ?? []),
      input.summary_status ?? "ready",
      input.origin ?? "knowledge_center",
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );

  return result.rows[0];
}
