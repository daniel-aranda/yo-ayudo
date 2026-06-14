import { pool } from "../db/client.js";
import { dashboard_auth } from "../dashboard/auth_middleware.js";
import { business_knowledge_service } from "../knowledge/business_knowledge_service.js";
import { logger } from "../shared/logger.js";

export function register_review_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;

  router.get("/review", dashboard_auth, async (request, response, next) => {
    try {
      // Account-scoped when ?account= is present (top nav carries the context);
      // otherwise all pending items across every account. The filter is appended
      // conditionally (rather than `$1 IS NULL OR ...`) to avoid pg-mem cast quirks.
      const account_id = (Array.isArray(request.query.account) ? request.query.account[0] : request.query.account) || null;
      const params = [];
      let account_filter = "";
      if (account_id) {
        params.push(account_id);
        account_filter = `AND bots.account_id = $${params.length}`;
      }
      const result = await route_pool.query(
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
          WHERE review_items.status = 'pending'
            ${account_filter}
          ORDER BY review_items.created_at DESC
          LIMIT 100
        `,
        params,
      );
      let scoped_account = null;
      if (account_id) {
        const account_row = await route_pool.query(
          `
            SELECT accounts.id, accounts.name, accounts.organization_id, organizations.name AS organization_name
            FROM accounts
            JOIN organizations ON organizations.id = accounts.organization_id
            WHERE accounts.id = $1
            LIMIT 1
          `,
          [account_id],
        );
        scoped_account = account_row.rows[0] ?? null;
      }
      response.render("review", { review_items: result.rows, scoped_account });
    } catch (error) {
      next(error);
    }
  });

  router.post("/review/:review_item_id/resolve", dashboard_auth, async (request, response, next) => {
    try {
      const note = String(request.body.note ?? "").trim();
      // Auto-aprender (opt-out): cuando un humano resuelve algo que el bot no pudo,
      // guardamos pregunta + respuesta como business_knowledge de la cuenta para
      // que el bot la reuse. El checkbox viene marcado por default.
      const should_learn = request.body.learn !== undefined && note.length > 0;
      const item = (
        await route_pool.query("SELECT * FROM review_items WHERE id = $1 LIMIT 1", [request.params.review_item_id])
      ).rows[0];

      // El aprendizaje no debe romper el resolve: si falla, se registra y sigue.
      let learned = false;
      if (should_learn && item?.account_id) {
        try {
          const question = String(item.raw_text ?? "").trim() || "Consulta de cliente";
          await new business_knowledge_service({ pool: route_pool }).create_document({
            organization_id: item.organization_id ?? null,
            account_id: item.account_id,
            bot_id: null, // conocimiento de la cuenta: reusable por cualquier bot
            scope: "account",
            document_type: "business_faq",
            title: question.slice(0, 120),
            content: `Pregunta: ${question}\nRespuesta: ${note}`,
            origin: "learned_from_review",
            source_name: question.slice(0, 120),
            source_description: note.slice(0, 200),
            metadata_json: { learned_from_review_item: item.id, message_id: item.message_id, source_bot_id: item.bot_id ?? null },
          });
          learned = true;
        } catch (error) {
          logger.error({ err: error, review_item_id: request.params.review_item_id }, "auto-learn from review failed");
        }
      }

      const result = await route_pool.query(
        `
          UPDATE review_items
          SET
            status = 'resolved',
            resolution_json = $2::jsonb,
            updated_at = now()
          WHERE id = $1
          RETURNING message_id
        `,
        [
          request.params.review_item_id,
          JSON.stringify({ note, learned, resolved_at: new Date().toISOString() }),
        ],
      );

      if (result.rows[0]) {
        await route_pool.query("UPDATE messages SET needs_review = false WHERE id = $1", [
          result.rows[0].message_id,
        ]);
      }

      // Preserve the account scope so resolving an item keeps the filtered view.
      // La cuenta es el único scope (el negocio se deriva de ella).
      const account = Array.isArray(request.body.account) ? request.body.account[0] : request.body.account;
      const redirect_qs = account ? `?account=${encodeURIComponent(account)}` : "";
      response.redirect(`/review${redirect_qs}`);
    } catch (error) {
      next(error);
    }
  });
}
