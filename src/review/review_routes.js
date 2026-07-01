import { pool } from "../db/client.js";
import { dashboard_auth } from "../dashboard/auth_middleware.js";
import { list_pending_review_items, resolve_review_item } from "./review_service.js";

export function register_review_routes(router, dependencies = {}) {
  const route_pool = dependencies.pool ?? pool;

  router.get("/review", dashboard_auth, async (request, response, next) => {
    try {
      // Account-scoped when ?account= is present (top nav carries the context);
      // otherwise all pending items across every account.
      const account_id = (Array.isArray(request.query.account) ? request.query.account[0] : request.query.account) || null;
      const review_items = await list_pending_review_items({ pool: route_pool, account_id });

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
      response.render("review", { review_items, scoped_account });
    } catch (error) {
      next(error);
    }
  });

  router.post("/review/:review_item_id/resolve", dashboard_auth, async (request, response, next) => {
    try {
      // Auto-aprender (opt-out): el checkbox viene marcado por default; resolver
      // sin nota no aprende. La lógica vive en review_service (compartida con la
      // review a nivel cuenta).
      await resolve_review_item({
        pool: route_pool,
        review_item_id: request.params.review_item_id,
        note: request.body.note,
        should_learn: request.body.learn !== undefined,
      });

      // Preserve the account scope so resolving an item keeps the filtered view.
      const account = Array.isArray(request.body.account) ? request.body.account[0] : request.body.account;
      const redirect_qs = account ? `?account=${encodeURIComponent(account)}` : "";
      response.redirect(`/review${redirect_qs}`);
    } catch (error) {
      next(error);
    }
  });
}
