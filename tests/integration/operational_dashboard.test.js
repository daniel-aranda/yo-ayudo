import express from "express";
import path from "node:path";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { register_dashboard_routes } from "../../src/dashboard/dashboard_routes.js";
import { navigation_context } from "../../src/app/navigation_middleware.js";
import { format_money } from "../../src/shared/money.js";
import { format_date_es, format_datetime_es } from "../../src/shared/dates.js";
import { create_test_pool } from "../helpers/test_pool.js";

function create_dashboard_test_app(pool) {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.date = format_date_es;
  app.locals.datetime = format_datetime_es;
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(navigation_context);

  register_dashboard_routes(router, { pool });
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });

  return app;
}

async function account_with_bots(pool) {
  const result = await pool.query(`
    SELECT accounts.id AS account_id, accounts.organization_id AS organization_id
    FROM accounts
    JOIN bots ON bots.account_id = accounts.id AND bots.status = 'active'
    WHERE accounts.status = 'active'
    LIMIT 1
  `);
  return result.rows[0];
}

async function seed_operational_day(pool, account_id, organization_id) {
  const day = await pool.query(
    `
      INSERT INTO op_business_days (
        account_id, organization_id, operation_date, status,
        opening_cash, total_sales, cash_sales, card_sales, transfer_sales, closing_cash
      )
      VALUES ($1, $2, CURRENT_DATE, 'closed', 1500, 8500, 3000, 4000, 1500, 4500)
      RETURNING id
    `,
    [account_id, organization_id],
  );
  await pool.query(
    `
      INSERT INTO op_purchases (account_id, organization_id, business_day_id, item_name, quantity, unit, total_cost, supplier_name_raw)
      VALUES ($1, $2, $3, 'pastor', 12, 'kg', 1680, 'Don Juan')
    `,
    [account_id, organization_id, day.rows[0].id],
  );
  return day.rows[0].id;
}

describe("Operational dashboard", () => {
  let pool;

  before_each(async () => {
    pool = await create_test_pool();
  });

  after_each(async () => {
    await pool?.end();
  });

  it("renders the operational day (sales, purchases, close) for an account", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    await seed_operational_day(pool, account_id, organization_id);

    const app = create_dashboard_test_app(pool);
    const response = await request(app)
      .get(`/dashboard/business/${organization_id}/accounts/${account_id}`)
      .expect(200);

    expect(response.text).toContain("Dashboard operativo");
    expect(response.text).toContain("Ventas del día");
    expect(response.text).toContain("8,500"); // total_sales formatted as MXN
    expect(response.text).toContain("pastor"); // seeded purchase
    expect(response.text).toContain("Caja final");
    expect(response.text).not.toContain("No hay dashboard operativo configurado");
    // T1: the operation date must be formatted in es-MX, not a raw JS Date.
    expect(response.text).not.toContain("GMT");
    expect(response.text).not.toContain("Standard Time");
  });

  it("shows the business page with its accounts (no auto-redirect into an account)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get(`/dashboard/business/${organization_id}`).expect(200);

    expect(response.text).toContain("Cuentas");
    expect(response.text).toContain(`/dashboard/business/${organization_id}/accounts/${account_id}`);
  });

  it("links the dashboard home to the business page (explicit Negocio → Cuenta hierarchy)", async () => {
    const { organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get("/dashboard").expect(200);

    // "Abrir" goes to the Negocio page, not straight into a Cuenta.
    expect(response.text).toContain(`href="/dashboard/business/${organization_id}"`);
  });

  it("shows the empty operational state when there is no business day", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app)
      .get(`/dashboard/business/${organization_id}/accounts/${account_id}`)
      .expect(200);

    expect(response.text).toContain("Aún no hay actividad operativa");
  });

  it("hides the operational dashboard for accounts whose bots have no operational capability", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    await seed_operational_day(pool, account_id, organization_id);
    // Strip operational actions: this account's bots are now commercial-only.
    await pool.query(
      `UPDATE bots SET acciones_habilitadas_json = '["buscar_negocios","guardar_nota"]'::jsonb WHERE account_id = $1`,
      [account_id],
    );

    const app = create_dashboard_test_app(pool);
    const response = await request(app)
      .get(`/dashboard/business/${organization_id}/accounts/${account_id}`)
      .expect(200);

    // Even with operational data present, no operational bot => no operational dashboard.
    expect(response.text).not.toContain("Dashboard operativo");
    expect(response.text).not.toContain("Ventas del día");
  });

  it("scopes the top nav to the account when one is in the URL (Inspector/Review carry it; Admin stays global)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app)
      .get(`/dashboard/business/${organization_id}/accounts/${account_id}`)
      .expect(200);

    // Pug HTML-escapes `&` to `&amp;` in attributes (browsers decode it back).
    const qs = `?business=${organization_id}&amp;account=${account_id}`;
    // Dashboard points back at this account's dashboard; Inspector/Review carry the scope.
    expect(response.text).toContain(`href="/dashboard/business/${organization_id}/accounts/${account_id}"`);
    expect(response.text).toContain(`href="/inspector${qs}"`);
    expect(response.text).toContain(`href="/review${qs}"`);
    // Admin is intentionally global — never scoped.
    expect(response.text).toContain('href="/admin/integrations"');
    expect(response.text).not.toContain(`href="/admin/integrations${qs}"`);
  });

  it("leaves the top nav unscoped on the global dashboard (no account context)", async () => {
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get("/dashboard").expect(200);

    // Plain nav targets, no ?business=&account= scope query.
    expect(response.text).toContain('href="/inspector"');
    expect(response.text).toContain('href="/review"');
    expect(response.text).not.toContain("?business=");
  });

  it("does not duplicate bots in the account view (one link per active bot)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app)
      .get(`/dashboard/business/${organization_id}/accounts/${account_id}`)
      .expect(200);

    const bot_link_matches = response.text.match(/href="\/inspector\/bots\//g) ?? [];
    const distinct_bots = await pool.query(
      "SELECT count(*)::int AS count FROM bots WHERE account_id = $1 AND status = 'active'",
      [account_id],
    );
    expect(bot_link_matches.length).toBe(distinct_bots.rows[0].count);
  });
});
