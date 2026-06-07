import { pool as default_pool } from "../db/client.js";
import { dashboard_auth } from "./auth_middleware.js";
import {
  get_account_dashboard_data,
  get_business_dashboard_data,
  get_dashboard_home,
} from "./dashboard_queries.js";

function require_param(value, name) {
  if (Array.isArray(value)) {
    if (value[0]) {
      return value[0];
    }
    throw new Error(`Missing route param: ${name}`);
  }

  if (!value) {
    throw new Error(`Missing route param: ${name}`);
  }

  return value;
}

export function register_dashboard_routes(router, dependencies = {}) {
  const pool = dependencies.pool ?? default_pool;

  router.get("/dashboard", dashboard_auth, async (_request, response, next) => {
    try {
      response.render("dashboard", await get_dashboard_home(pool));
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/business/:business_id", dashboard_auth, async (request, response, next) => {
    try {
      response.render(
        "business",
        await get_business_dashboard_data(pool, require_param(request.params.business_id, "business_id")),
      );
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/dashboard/business/:business_id/accounts/:account_id",
    dashboard_auth,
    async (request, response, next) => {
      try {
        response.render(
          "account",
          await get_account_dashboard_data(pool, {
            business_id: require_param(request.params.business_id, "business_id"),
            account_id: require_param(request.params.account_id, "account_id"),
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );

}
