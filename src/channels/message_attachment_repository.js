// Adjuntos de mensajes (descriptor de dónde quedó el binario: S3 o local).
// El binario lo guarda `conversation_media_store`; aquí solo persiste el registro.

export async function create_message_attachment(pool, input) {
  const result = await pool.query(
    `
      INSERT INTO message_attachments (
        message_id, organization_id, account_id, channel, provider,
        bucket, s3_key, local_path, region, mime_type, size_bytes, original_filename, source_media_id, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `,
    [
      input.message_id,
      input.organization_id ?? null,
      input.account_id ?? null,
      input.channel ?? "whatsapp",
      input.provider,
      input.bucket ?? null,
      input.s3_key ?? null,
      input.local_path ?? null,
      input.region ?? null,
      input.mime_type ?? null,
      input.size_bytes ?? null,
      input.original_filename ?? null,
      input.source_media_id ?? null,
      input.status ?? "stored",
    ],
  );
  return result.rows[0];
}

export async function get_message_attachment(pool, id) {
  const result = await pool.query("SELECT * FROM message_attachments WHERE id = $1 LIMIT 1", [id]);
  return result.rows[0] ?? null;
}

// Adjuntos de un conjunto de mensajes (para el visor de conversación). Usa IN con
// placeholders (pg-mem-safe) en vez de ANY($1::uuid[]).
export async function list_attachments_for_messages(pool, message_ids) {
  if (!Array.isArray(message_ids) || !message_ids.length) return [];
  const placeholders = message_ids.map((_, index) => `$${index + 1}`).join(", ");
  const result = await pool.query(
    `SELECT * FROM message_attachments WHERE message_id IN (${placeholders}) ORDER BY created_at ASC`,
    message_ids,
  );
  return result.rows;
}
