export async function upsert_memory_document(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO memory_documents (
        tenant_id,
        branch_id,
        contact_id,
        conversation_id,
        message_id,
        business_day_id,
        solution_template_id,
        bot_profile_id,
        scope,
        document_type,
        title,
        content,
        content_hash,
        source_table,
        source_id,
        source_created_at,
        metadata_json,
        visibility,
        status,
        version
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17::jsonb, $18, 'pending', $19
      )
      ON CONFLICT (source_table, source_id, document_type, version)
      DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        branch_id = EXCLUDED.branch_id,
        contact_id = EXCLUDED.contact_id,
        conversation_id = EXCLUDED.conversation_id,
        message_id = EXCLUDED.message_id,
        business_day_id = EXCLUDED.business_day_id,
        solution_template_id = EXCLUDED.solution_template_id,
        bot_profile_id = EXCLUDED.bot_profile_id,
        scope = EXCLUDED.scope,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        content_hash = EXCLUDED.content_hash,
        source_created_at = EXCLUDED.source_created_at,
        metadata_json = EXCLUDED.metadata_json,
        visibility = EXCLUDED.visibility,
        status = 'pending',
        embedding_status = 'pending',
        embedding_error = NULL,
        updated_at = now()
      RETURNING *
    `,
    [
      input.tenant_id ?? null,
      input.branch_id ?? null,
      input.contact_id ?? null,
      input.conversation_id ?? null,
      input.message_id ?? null,
      input.business_day_id ?? null,
      input.solution_template_id ?? null,
      input.bot_profile_id ?? null,
      input.scope,
      input.document_type,
      input.title ?? null,
      input.content,
      input.content_hash,
      input.source_table ?? null,
      input.source_id ?? null,
      input.source_created_at ?? null,
      JSON.stringify(input.metadata_json ?? {}),
      input.visibility ?? "private",
      input.version ?? 1,
    ],
  );

  return result.rows[0];
}

export async function mark_memory_document_stored(pool, input) {
  const result = await pool.query(
    `
      UPDATE memory_documents
      SET
        status = 'stored',
        s3_bucket = $2,
        s3_key = $3,
        local_path = $4,
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [
      input.document_id,
      input.s3_bucket ?? null,
      input.s3_key ?? null,
      input.local_path ?? null,
    ],
  );

  return result.rows[0];
}

export async function mark_memory_document_failed(pool, input) {
  const result = await pool.query(
    `
      UPDATE memory_documents
      SET
        status = 'failed',
        embedding_status = 'failed',
        embedding_error = $2,
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [input.document_id, input.error_message],
  );

  return result.rows[0];
}

export async function mark_memory_document_embedded(pool, input) {
  const result = await pool.query(
    `
      UPDATE memory_documents
      SET
        embedding_status = 'completed',
        embedding_provider = $2,
        embedding_model = $3,
        embedding_vector_id = $4,
        embedding_index_name = $5,
        embedding_error = NULL,
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [
      input.document_id,
      input.embedding_provider,
      input.embedding_model,
      input.embedding_vector_id,
      input.embedding_index_name,
    ],
  );

  return result.rows[0];
}
