import express from "express";
import path from "node:path";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { register_dashboard_routes } from "../../src/dashboard/dashboard_routes.js";
import { navigation_context } from "../../src/app/navigation_middleware.js";
import { format_money } from "../../src/shared/money.js";
import { format_date_es, format_datetime_es } from "../../src/shared/dates.js";
import { format_phone } from "../../src/inspector/inspector_presenter.js";
import { create_test_pool } from "../helpers/test_pool.js";
import { seed_routed_demo_conversation } from "../../src/db/seed.js";

function create_dashboard_test_app(pool) {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.date = format_date_es;
  app.locals.datetime = format_datetime_es;
  app.locals.phone = format_phone;
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
    const response = await request(app).get(`/dashboard/accounts/${account_id}`).expect(200);

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
    // "Abrir cuenta" apunta a la URL account-only (el negocio se deriva de ella).
    expect(response.text).toContain(`/dashboard/accounts/${account_id}`);
  });

  it("links the dashboard home to the business page (explicit Negocio → Cuenta hierarchy)", async () => {
    const { organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get("/dashboard").expect(200);

    // "Abrir" goes to the Negocio page, not straight into a Cuenta.
    expect(response.text).toContain(`href="/dashboard/business/${organization_id}"`);
  });

  it("redirects the legacy business+account URL (and subroutes) to the account-only canonical", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    await request(app)
      .get(`/dashboard/business/${organization_id}/accounts/${account_id}`)
      .expect(301)
      .expect("Location", `/dashboard/accounts/${account_id}`);

    await request(app)
      .get(`/dashboard/business/${organization_id}/accounts/${account_id}/tasks`)
      .expect(301)
      .expect("Location", `/dashboard/accounts/${account_id}/tasks`);
  });

  it("shows the empty operational state when there is no business day", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app)
      .get(`/dashboard/accounts/${account_id}`)
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
      .get(`/dashboard/accounts/${account_id}`)
      .expect(200);

    // Even with operational data present, no operational bot => no operational dashboard.
    expect(response.text).not.toContain("Dashboard operativo");
    expect(response.text).not.toContain("Ventas del día");
  });

  it("scopes the top nav to the account when one is in the URL (Inspector/Review carry it; Admin stays global)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get(`/dashboard/accounts/${account_id}`).expect(200);

    // La cuenta es el único scope. Dashboard e Inspector la llevan en el path;
    // Review en ?account=. Admin es global a propósito (nunca scopeado).
    const qs = `?account=${account_id}`;
    expect(response.text).toContain(`href="/dashboard/accounts/${account_id}"`);
    expect(response.text).toContain(`href="/inspector/accounts/${account_id}"`);
    expect(response.text).toContain(`href="/review${qs}"`);
    expect(response.text).toContain('href="/admin/integrations"');
    expect(response.text).not.toContain(`href="/admin/integrations${qs}"`);
  });

  it("leaves the top nav unscoped on the global dashboard (no account context)", async () => {
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get("/dashboard").expect(200);

    // Plain nav targets, no ?account= scope query.
    expect(response.text).toContain('href="/inspector"');
    expect(response.text).toContain('href="/review"');
    expect(response.text).not.toContain("?account=");
  });

  it("does not duplicate bots in the account view (one link per active bot)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app)
      .get(`/dashboard/accounts/${account_id}`)
      .expect(200);

    const bot_link_matches = response.text.match(/href="\/inspector\/bots\//g) ?? [];
    // El panel muestra todos los bots no archivados (incluye drafts).
    const distinct_bots = await pool.query(
      "SELECT count(*)::int AS count FROM bots WHERE account_id = $1 AND status != 'archived'",
      [account_id],
    );
    expect(bot_link_matches.length).toBe(distinct_bots.rows[0].count);
  });

  it("creates account bots from the dashboard: custom draft or cloned from a system bot", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);
    const base = `/dashboard/accounts/${account_id}`;

    // La página ofrece el alta con tabs (Bot Nuevo | Bot preconfigurado), los
    // preconfigurados como tarjetas seleccionables (no dropdown) y con buscador.
    const page = await request(app).get(base).expect(200);
    expect(page.text).toContain("Agregar bot");
    expect(page.text).toContain('data-section="custom"');
    expect(page.text).toContain('data-section="system"');
    expect(page.text).toContain("Bot Nuevo");
    expect(page.text).toContain("Bot preconfigurado");
    expect(page.text).toContain("system-bot-pick");
    expect(page.text).toContain("system_bot_search");
    expect(page.text).not.toContain("system_bot_picker");

    // Custom desde cero → draft del tipo custom en esta cuenta, visible en el panel.
    await request(app)
      .post(`${base}/bots`)
      .type("form")
      .send({ name: "Bot Dashboard Custom" })
      .expect(302)
      .expect("Location", `${base}#panel-bots`);
    const custom = (await pool.query("SELECT * FROM bots WHERE slug = 'bot-dashboard-custom' LIMIT 1")).rows[0];
    expect(custom).toBeTruthy();
    expect(custom.status).toBe("draft");
    expect(custom.bot_type).toBe("custom");
    expect(custom.account_id).toBe(account_id);
    const refreshed = await request(app).get(base).expect(200);
    expect(refreshed.text).toContain("Bot Dashboard Custom");

    // Desde bot de sistema → clon custom en draft, sin knowledge ni grupos de la
    // cuenta origen (el bot de sistema seedeado vive en esta misma cuenta, así
    // que el slug del clon se desambigua con sufijo).
    const system_bot = (
      await pool.query("SELECT id, name, slug FROM bots WHERE bot_type = 'system' AND status = 'active' LIMIT 1")
    ).rows[0];
    expect(system_bot).toBeTruthy();
    await request(app).post(`${base}/bots`).type("form").send({ source_bot_id: system_bot.id }).expect(302);
    const clone = (
      await pool.query("SELECT * FROM bots WHERE slug = $1 AND id != $2 LIMIT 1", [`${system_bot.slug}-2`, system_bot.id])
    ).rows[0];
    expect(clone).toBeTruthy();
    expect(clone.bot_type).toBe("custom");
    expect(clone.status).toBe("draft");
    expect(clone.name).toBe(system_bot.name);
    expect(clone.definition_json.knowledge_source_ids).toEqual([]);
    expect(clone.knowledge_base_ids_json).toEqual([]);
    for (const interaction of clone.definition_json.interactions ?? []) {
      expect(interaction.human_group_ids ?? []).toEqual([]);
    }

    // Guardas: cuenta inexistente → 404; bot de sistema inexistente → 400.
    await request(app)
      .post(`/dashboard/accounts/00000000-0000-0000-0000-000000000001/bots`)
      .type("form")
      .send({ name: "Cuenta inexistente" })
      .expect(404);
    await request(app)
      .post(`${base}/bots`)
      .type("form")
      .send({ source_bot_id: "00000000-0000-0000-0000-000000000002" })
      .expect(400);
    await request(app).post(`${base}/bots`).type("form").send({}).expect(400);
  });

  it("connects a WhatsApp channel from the dashboard (Instagram still coming soon)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);
    const base = `/dashboard/accounts/${account_id}`;

    // La página ofrece el alta con tabs WhatsApp | Instagram (coming soon).
    const page = await request(app).get(base).expect(200);
    expect(page.text).toContain("Agregar canal");
    expect(page.text).toContain('data-section="whatsapp"');
    expect(page.text).toContain('data-section="instagram"');
    expect(page.text).toContain("Instagram llega pronto");

    // Alta de WhatsApp con bot conectado de una vez.
    const bot = (await pool.query("SELECT id FROM bots WHERE account_id = $1 AND status = 'active' LIMIT 1", [account_id]))
      .rows[0];
    await request(app)
      .post(`${base}/channels`)
      .type("form")
      .send({
        channel_type: "whatsapp",
        display_phone_number: "+52 55 9999 0000",
        phone_number_id: "dashboard-test-phone-id",
        bot_id: bot.id,
      })
      .expect(302)
      .expect("Location", `${base}#panel-canales`);

    const channel = (
      await pool.query("SELECT * FROM whatsapp_phone_numbers WHERE phone_number_id = 'dashboard-test-phone-id' LIMIT 1")
    ).rows[0];
    expect(channel).toBeTruthy();
    expect(channel.account_id).toBe(account_id);
    expect(channel.status).toBe("active");
    const assignment = (
      await pool.query(
        "SELECT * FROM phone_number_bot_assignments WHERE whatsapp_phone_number_id = $1 AND active_key = 'active' LIMIT 1",
        [channel.id],
      )
    ).rows[0];
    expect(assignment).toBeTruthy();
    expect(assignment.bot_id).toBe(bot.id);

    const refreshed = await request(app).get(base).expect(200);
    expect(refreshed.text).toContain("+52 55 9999 0000");

    // Un phone_number_id ya dado de alta en OTRA cuenta no se puede robar.
    const other_account = (
      await pool.query(
        "INSERT INTO accounts (organization_id, name, slug) VALUES ($1, 'Cuenta Canal Test', 'cuenta-canal-test') RETURNING id",
        [organization_id],
      )
    ).rows[0];
    const stolen = await request(app)
      .post(`/dashboard/accounts/${other_account.id}/channels`)
      .type("form")
      .send({ channel_type: "whatsapp", display_phone_number: "+52 55 1111 2222", phone_number_id: "dashboard-test-phone-id" })
      .expect(400);
    expect(stolen.text).toContain("otra cuenta");

    // Canal no soportado y campos faltantes → 400.
    await request(app).post(`${base}/channels`).type("form").send({ channel_type: "instagram" }).expect(400);
    await request(app).post(`${base}/channels`).type("form").send({ channel_type: "whatsapp" }).expect(400);
    // Bot de otra cuenta → 400.
    await request(app)
      .post(`/dashboard/accounts/${other_account.id}/channels`)
      .type("form")
      .send({
        channel_type: "whatsapp",
        display_phone_number: "+52 55 3333 4444",
        phone_number_id: "dashboard-test-phone-id-2",
        bot_id: bot.id,
      })
      .expect(400);
  });

  it("account tasks module: lists, shows detail with follow-up history, and scopes to the account", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const bot = (
      await pool.query("SELECT id FROM bots WHERE account_id = $1 AND status = 'active' LIMIT 1", [account_id])
    ).rows[0];
    await seed_routed_demo_conversation(pool, { account_id, organization_id, bot_id: bot.id });
    const app = create_dashboard_test_app(pool);
    const base = `/dashboard/accounts/${account_id}/tasks`;

    // Lista scopeada a la cuenta (breadcrump + sin columna Negocio/cuenta).
    const list = await request(app).get(base).expect(200);
    expect(list.text).toContain("Llamar al cliente");
    expect(list.text).not.toContain("Negocio / cuenta");

    const task = (
      await pool.query("SELECT id FROM internal_tasks WHERE titulo LIKE 'Llamar al cliente%' LIMIT 1")
    ).rows[0];

    // Detalle + agregar actualización (quién atendió y qué pasó).
    const detail = await request(app).get(`${base}/${task.id}`).expect(200);
    expect(detail.text).toContain("Seguimiento");
    await request(app)
      .post(`${base}/${task.id}/update`)
      .type("form")
      .send({ actor: "Beto", note: "Cliente contactado, cerrado.", status: "hecha" })
      .expect(302);
    const after = await request(app).get(`${base}/${task.id}`).expect(200);
    expect(after.text).toContain("Beto");
    expect(after.text).toContain("Cliente contactado, cerrado.");
    expect((await pool.query("SELECT status, assigned_to FROM internal_tasks WHERE id = $1", [task.id])).rows[0].status).toBe(
      "hecha",
    );

    // Scope: una 2da cuenta del mismo negocio NO ve esa tarea (404).
    const other = (
      await pool.query(
        "INSERT INTO accounts (organization_id, name, slug, status) VALUES ($1, 'Otra Cuenta Tasks', 'otra-cuenta-tasks', 'active') RETURNING id",
        [organization_id],
      )
    ).rows[0];
    await request(app)
      .get(`/dashboard/accounts/${other.id}/tasks/${task.id}`)
      .expect(404);
  });
});
