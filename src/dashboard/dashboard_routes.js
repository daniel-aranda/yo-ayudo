import { pool } from "../db/client.js";
import { assert_date_key } from "../shared/dates.js";
import { dashboard_auth } from "./auth_middleware.js";
import {
  get_branch_dashboard_data,
  get_dashboard_home,
  get_default_branch_date,
  get_tenant_dashboard_data,
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

  router.get("/dashboard/tenants/:tenant_id", dashboard_auth, async (request, response, next) => {
    try {
      response.render("tenant", await get_tenant_dashboard_data(pool, require_param(request.params.tenant_id, "tenant_id")));
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/dashboard/tenants/:tenant_id/branches/:branch_id",
    dashboard_auth,
    async (request, response, next) => {
      try {
        const tenant_id = require_param(request.params.tenant_id, "tenant_id");
        const branch_id = require_param(request.params.branch_id, "branch_id");
        const operation_date = await get_default_branch_date(pool, { tenant_id, branch_id });
        response.redirect(`/dashboard/tenants/${tenant_id}/branches/${branch_id}/days/${operation_date}`);
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/dashboard/tenants/:tenant_id/branches/:branch_id/days/:date",
    dashboard_auth,
    async (request, response, next) => {
      try {
        response.render(
          "branch",
          await get_branch_dashboard_data(pool, {
            tenant_id: require_param(request.params.tenant_id, "tenant_id"),
            branch_id: require_param(request.params.branch_id, "branch_id"),
            operation_date: assert_date_key(require_param(request.params.date, "date")),
          }),
        );
      } catch (error) {
        next(error);
      }
    },
  );
}
