import { pool } from "../db/client.js";
import { dashboard_auth } from "../dashboard/auth_middleware.js";

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
          JSON.stringify({
            note: request.body.note ?? "",
            resolved_at: new Date().toISOString(),
          }),
        ],
      );

      if (result.rows[0]) {
        await route_pool.query("UPDATE messages SET needs_review = false WHERE id = $1", [
          result.rows[0].message_id,
        ]);
      }

      // Preserve the account scope so resolving an item keeps the filtered view.
      const business = Array.isArray(request.body.business) ? request.body.business[0] : request.body.business;
      const account = Array.isArray(request.body.account) ? request.body.account[0] : request.body.account;
      const redirect_qs = business && account ? `?business=${encodeURIComponent(business)}&account=${encodeURIComponent(account)}` : "";
      response.redirect(`/review${redirect_qs}`);
    } catch (error) {
      next(error);
    }
  });
}
