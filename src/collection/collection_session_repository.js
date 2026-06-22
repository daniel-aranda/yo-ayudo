// Repositorio de la sesión de recolección (memoria viva). Estado operativo, no
// conocimiento: lectura/escritura directa, sin embeddings. La sesión activa
// (`collecting`) es única por conversación; al cerrar pasa a `ready` (cola) y al
// consumirse a `completed`.

export async function create_collection_session(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO information_collection_sessions (
        organization_id, account_id, bot_id, conversation_id, contact_id,
        action_id, objective, guidance, status, findings_json, transcript_json,
        last_question, turn_count, max_turns, follow_up_action, metadata_json
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'collecting','{}'::jsonb,'[]'::jsonb,$9,0,$10,$11,$12::jsonb)
      RETURNING *
    `,
    [
      input.organization_id ?? null,
      input.account_id ?? null,
      input.bot_id ?? null,
      input.conversation_id,
      input.contact_id ?? null,
      input.action_id ?? "recolectar_informacion",
      input.objective ?? null,
      input.guidance ?? null,
      input.last_question ?? null,
      input.max_turns ?? 8,
      input.follow_up_action ?? null,
      JSON.stringify(input.metadata_json ?? {}),
    ],
  );
  return result.rows[0];
}

// La sesión que está capturando la conversación ahora mismo.
export async function get_active_collection_session(pool, conversation_id) {
  const result = await pool.query(
    "SELECT * FROM information_collection_sessions WHERE conversation_id = $1 AND status = 'collecting' ORDER BY created_at DESC LIMIT 1",
    [conversation_id],
  );
  return result.rows[0] ?? null;
}

// La última recolección lista (en cola) para que una generación la consuma.
export async function get_latest_ready_collection_session(pool, conversation_id) {
  const result = await pool.query(
    "SELECT * FROM information_collection_sessions WHERE conversation_id = $1 AND status = 'ready' ORDER BY completed_at DESC NULLS LAST, updated_at DESC LIMIT 1",
    [conversation_id],
  );
  return result.rows[0] ?? null;
}

export async function advance_collection_session(pool, id, patch) {
  const result = await pool.query(
    `
      UPDATE information_collection_sessions
      SET findings_json = $2::jsonb,
          transcript_json = $3::jsonb,
          last_question = $4,
          turn_count = $5,
          last_activity_at = now(),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [id, JSON.stringify(patch.findings_json ?? {}), JSON.stringify(patch.transcript_json ?? []), patch.last_question ?? null, patch.turn_count ?? 0],
  );
  return result.rows[0];
}

// Cierra la recolección: queda `ready` (en cola). Conserva findings/transcript.
export async function complete_collection_session(pool, id, patch) {
  const result = await pool.query(
    `
      UPDATE information_collection_sessions
      SET status = 'ready',
          findings_json = $2::jsonb,
          transcript_json = $3::jsonb,
          turn_count = $4,
          completion_reason = $5,
          last_question = NULL,
          completed_at = now(),
          last_activity_at = now(),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `,
    [id, JSON.stringify(patch.findings_json ?? {}), JSON.stringify(patch.transcript_json ?? []), patch.turn_count ?? 0, patch.completion_reason ?? "llm_ready"],
  );
  return result.rows[0];
}

// Una generación consumió el resultado: queda `completed`.
export async function consume_collection_session(pool, id) {
  const result = await pool.query(
    "UPDATE information_collection_sessions SET status = 'completed', updated_at = now() WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0];
}

export async function abandon_collection_session(pool, id) {
  const result = await pool.query(
    "UPDATE information_collection_sessions SET status = 'abandoned', updated_at = now() WHERE id = $1 RETURNING *",
    [id],
  );
  return result.rows[0];
}
