import { pool as default_pool } from "../db/client.js";
import { business_knowledge_service } from "../knowledge/business_knowledge_service.js";
import { logger } from "../shared/logger.js";

// Cola de review compartida por la vista global (/review, cabina del operador) y
// la de cuenta (/dashboard/accounts/:id/review, superficie del dueño). Una sola
// fuente de verdad para listar y resolver los "mensajes que el bot no supo
// resolver" (review_items). El predicado de estado es IN ('pending','open'):
// es el mismo de pending_review_count y del inspector, así el conteo "Sin
// resolver" del dashboard cuadra con los badges de las conversaciones.

// Lista los items activos. Si llega account_id, scopea a esa cuenta por
// bots.account_id (igual que pending_review_count). El filtro se concatena
// condicionalmente (en vez de `$1 IS NULL OR ...`) para evitar casts raros en pg-mem.
export async function list_pending_review_items({ pool = default_pool, account_id = null } = {}) {
  const params = [];
  let account_filter = "";
  if (account_id) {
    params.push(account_id);
    account_filter = `AND bots.account_id = $${params.length}`;
  }
  const result = await pool.query(
    `
      SELECT
        review_items.*,
        organizations.name AS business_name,
        accounts.name AS account_name,
        bots.name AS bot_name
      FROM review_items
      LEFT JOIN bots ON bots.id = review_items.bot_id
      LEFT JOIN accounts ON accounts.id = bots.account_id
      LEFT JOIN organizations ON organizations.id = bots.organization_id
      WHERE review_items.status IN ('pending', 'open')
        ${account_filter}
      ORDER BY review_items.created_at DESC
      LIMIT 100
    `,
    params,
  );
  return result.rows;
}

// Resuelve un item y (opt-in) lo guarda como conocimiento del negocio para que
// el bot lo reuse. El aprendizaje no debe romper el resolve: si falla, se
// registra y sigue. Devuelve { resolved, learned }.
export async function resolve_review_item({ pool = default_pool, review_item_id, note = "", should_learn = false }) {
  const trimmed_note = String(note ?? "").trim();
  const learn = Boolean(should_learn) && trimmed_note.length > 0;

  const item = (
    await pool.query("SELECT * FROM review_items WHERE id = $1 LIMIT 1", [review_item_id])
  ).rows[0];

  if (!item) {
    return { resolved: false, learned: false };
  }

  let learned = false;
  if (learn && item.account_id) {
    try {
      const question = String(item.raw_text ?? "").trim() || "Consulta de cliente";
      await new business_knowledge_service({ pool }).create_document({
        organization_id: item.organization_id ?? null,
        account_id: item.account_id,
        bot_id: null, // conocimiento de la cuenta: reusable por cualquier bot
        scope: "account",
        document_type: "business_faq",
        title: question.slice(0, 120),
        content: `Pregunta: ${question}\nRespuesta: ${trimmed_note}`,
        origin: "learned_from_review",
        source_name: question.slice(0, 120),
        source_description: trimmed_note.slice(0, 200),
        metadata_json: { learned_from_review_item: item.id, message_id: item.message_id, source_bot_id: item.bot_id ?? null },
      });
      learned = true;
    } catch (error) {
      logger.error({ err: error, review_item_id }, "auto-learn from review failed");
    }
  }

  const result = await pool.query(
    `
      UPDATE review_items
      SET
        status = 'resolved',
        resolution_json = $2::jsonb,
        updated_at = now()
      WHERE id = $1
      RETURNING message_id
    `,
    [review_item_id, JSON.stringify({ note: trimmed_note, learned, resolved_at: new Date().toISOString() })],
  );

  if (result.rows[0]) {
    await pool.query("UPDATE messages SET needs_review = false WHERE id = $1", [result.rows[0].message_id]);
  }

  return { resolved: Boolean(result.rows[0]), learned };
}
