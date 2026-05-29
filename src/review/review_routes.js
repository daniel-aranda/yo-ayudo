import { pool } from "../db/client.js";
import { dashboard_auth } from "../dashboard/auth_middleware.js";

export function register_review_routes(router) {
  router.get("/review", dashboard_auth, async (_request, response, next) => {
    try {
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
          WHERE review_items.status = 'pending'
          ORDER BY review_items.created_at DESC
          LIMIT 100
        `,
      );
      response.render("review", { review_items: result.rows });
    } catch (error) {
      next(error);
    }
  });

  router.post("/review/:review_item_id/resolve", dashboard_auth, async (request, response, next) => {
    try {
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
        [
          request.params.review_item_id,
          JSON.stringify({
            note: request.body.note ?? "",
            resolved_at: new Date().toISOString(),
          }),
        ],
      );

      if (result.rows[0]) {
        await pool.query("UPDATE messages SET needs_review = false WHERE id = $1", [
          result.rows[0].message_id,
        ]);
      }

      response.redirect("/review");
    } catch (error) {
      next(error);
    }
  });
}
