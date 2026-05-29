import { pool } from "../db/client.js";
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

export function register_dashboard_routes(router) {
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

  router.get("/dashboard/tenants/:tenant_id", dashboard_auth, async (request, response, next) => {
    try {
      const account = await pool.query("SELECT organization_id FROM accounts WHERE tenant_id = $1 LIMIT 1", [
        require_param(request.params.tenant_id, "tenant_id"),
      ]);
      if (!account.rows[0]) {
        response.redirect("/dashboard");
        return;
      }
      response.redirect(`/dashboard/business/${account.rows[0].organization_id}`);
    } catch (error) {
      next(error);
    }
  });

  router.get("/dashboard/tenants/:tenant_id/branches/:branch_id", dashboard_auth, async (request, response, next) => {
    try {
      const account = await pool.query("SELECT id, organization_id FROM accounts WHERE tenant_id = $1 LIMIT 1", [
        require_param(request.params.tenant_id, "tenant_id"),
      ]);
      if (!account.rows[0]) {
        response.redirect("/dashboard");
        return;
      }
      response.redirect(`/dashboard/business/${account.rows[0].organization_id}/accounts/${account.rows[0].id}`);
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/dashboard/tenants/:tenant_id/branches/:branch_id/days/:date",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const account = await pool.query("SELECT id, organization_id FROM accounts WHERE tenant_id = $1 LIMIT 1", [
          require_param(request.params.tenant_id, "tenant_id"),
        ]);
        if (!account.rows[0]) {
          response.redirect("/dashboard");
          return;
        }
        response.redirect(`/dashboard/business/${account.rows[0].organization_id}/accounts/${account.rows[0].id}`);
      } catch (error) {
        next(error);
      }
    },
  );
}
