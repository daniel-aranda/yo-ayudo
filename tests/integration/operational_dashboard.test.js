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

// Crea una cuenta+bot frescos (aislados del seed demo) con un review_item
// pendiente colgado de un mensaje real (review_items.message_id es NOT NULL).
// Devuelve { account_id, organization_id, bot_id, item_id }.
async function seed_pending_review(pool, { slug, reason }) {
  const organization_id = (await pool.query("SELECT id FROM organizations LIMIT 1")).rows[0].id;
  const account = (
    await pool.query(
      "INSERT INTO accounts (organization_id, name, slug, status) VALUES ($1, $2, $3, 'active') RETURNING *",
      [organization_id, `Cuenta ${slug}`, `cuenta-${slug}`],
    )
  ).rows[0];
  const bot = (
    await pool.query(
      "INSERT INTO bots (organization_id, account_id, name, slug, bot_type, status) VALUES ($1, $2, $3, $4, 'whatsapp', 'active') RETURNING *",
      [organization_id, account.id, `Bot ${slug}`, `bot-${slug}`],
    )
  ).rows[0];
  const contact = (
    await pool.query(
      "INSERT INTO contacts (account_id, organization_id, whatsapp_phone, display_name) VALUES ($1, $2, $3, 'Cliente Review') RETURNING id",
      [account.id, organization_id, `52155${String(reason.length).padStart(7, "0").slice(-7)}`],
    )
  ).rows[0];
  const conversation = (
    await pool.query(
      "INSERT INTO conversations (account_id, organization_id, bot_id, contact_id, channel, last_message_at) VALUES ($1, $2, $3, $4, 'whatsapp', now()) RETURNING id",
      [account.id, organization_id, bot.id, contact.id],
    )
  ).rows[0];
  const message = (
    await pool.query(
      `
        INSERT INTO messages (
          account_id, organization_id, bot_id, conversation_id, contact_id,
          direction, external_message_id, raw_payload_json, text_body, processing_status
        )
        VALUES ($1, $2, $3, $4, $5, 'inbound', $6, '{}'::jsonb, $7, 'stored')
        RETURNING id
      `,
      [account.id, organization_id, bot.id, conversation.id, contact.id, `review-${slug}`, reason],
    )
  ).rows[0];
  const item = (
    await pool.query(
      "INSERT INTO review_items (account_id, organization_id, bot_id, message_id, reason, status, raw_text) VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id",
      [account.id, organization_id, bot.id, message.id, reason, reason],
    )
  ).rows[0];
  return { account_id: account.id, organization_id, bot_id: bot.id, item_id: item.id };
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
    // Default range is "Hoy" → the single-day operational detail renders.
    const response = await request(app).get(`/dashboard/accounts/${account_id}`).expect(200);

    // Métricas unificadas (sin la antigua zona amurallada "Dashboard operativo").
    expect(response.text).toContain("Ventas"); // métrica unificada (ya no "Ventas del día")
    expect(response.text).toContain("8,500"); // total_sales formatted as MXN (suma del rango "Hoy")
    expect(response.text).toContain("pastor"); // seeded purchase (detalle del día)
    expect(response.text).toContain("Caja final"); // detalle de un solo día
    expect(response.text).not.toContain("Dashboard operativo"); // la cabecera vieja se fue
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

  it("hides the operational detail for accounts whose bots have no operational capability", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    await seed_operational_day(pool, account_id, organization_id);

    const app = create_dashboard_test_app(pool);
    // Antes de quitar las capacidades: la cuenta operativa SÍ muestra el detalle
    // de un solo día (caja/compras). Sirve de control contra el caso negativo.
    const operational = await request(app).get(`/dashboard/accounts/${account_id}`).expect(200);
    expect(operational.text).toContain("Caja final");
    expect(operational.text).toContain("Caja inicial");
    expect(operational.text).toContain("pastor"); // tabla de compras del día

    // Strip operational actions: this account's bots are now commercial-only.
    await pool.query(
      `UPDATE bots SET acciones_habilitadas_json = '["buscar_negocios","guardar_nota"]'::jsonb WHERE account_id = $1`,
      [account_id],
    );

    const response = await request(app)
      .get(`/dashboard/accounts/${account_id}`)
      .expect(200);

    // Even with operational data present, no operational bot => no single-day
    // detail. Se aserta la ausencia de marcadores inequívocos (no "Ventas", que
    // podría colisionar con el nombre de la cuenta sembrada).
    expect(response.text).not.toContain("Caja final");
    expect(response.text).not.toContain("Caja inicial");
    expect(response.text).not.toContain("Desglose de ventas");
    expect(response.text).not.toContain("pastor"); // sin tabla de compras del día
  });

  it("accumulates sales/purchases over a multi-day range without the single-day detail", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    await seed_operational_day(pool, account_id, organization_id);

    const app = create_dashboard_test_app(pool);
    const response = await request(app).get(`/dashboard/accounts/${account_id}?range=7d`).expect(200);

    // Las métricas unificadas siguen visibles (acumuladas sobre el rango).
    expect(response.text).toContain("Conversaciones");
    expect(response.text).toContain("Ventas");
    expect(response.text).toContain("8,500"); // total_sales sumado en los últimos 7 días
    // El preset "7 días" queda activo (Pug renderiza class antes que href).
    expect(response.text).toContain('<a class="is-active" href="/dashboard/accounts/' + account_id + '?range=7d"');
    // El detalle de un solo día (caja/compras) NO aplica a rangos multi-día.
    expect(response.text).not.toContain("Caja final");
    expect(response.text).not.toContain("pastor");
  });

  it("scopes the top nav to the account when one is in the URL (Bots/Canales scoped; Review/Admin operator-only)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get(`/dashboard/accounts/${account_id}`).expect(200);

    // El nav del dueño (Dashboard/Bots/Canales) se queda scopeado a la cuenta;
    // Review (?account=) y Admin son del operador. Inspector ya no va en el header.
    const qs = `?account=${account_id}`;
    expect(response.text).toContain(`href="/dashboard/accounts/${account_id}"`);
    expect(response.text).toContain(`href="/dashboard/accounts/${account_id}/bots"`);
    expect(response.text).toContain(`href="/dashboard/accounts/${account_id}/channels"`);
    expect(response.text).not.toContain(`href="/inspector/accounts/${account_id}"`);
    expect(response.text).toContain(`href="/review${qs}"`);
    expect(response.text).toContain('href="/admin/integrations"');
    expect(response.text).not.toContain(`href="/admin/integrations${qs}"`);
  });

  it("leaves the top nav unscoped on the global dashboard (no account context: no Bots/Canales)", async () => {
    const app = create_dashboard_test_app(pool);

    const response = await request(app).get("/dashboard").expect(200);

    // Sin cuenta en contexto no hay Bots/Canales en el nav; Review queda sin scope.
    expect(response.text).toContain('href="/review"');
    expect(response.text).not.toContain("?account=");
    expect(response.text).not.toContain('href="/dashboard/accounts/');
    expect(response.text).not.toContain('href="/inspector"');
  });

  it("does not duplicate bots in the bots page (one link per active bot)", async () => {
    const { account_id, organization_id } = await account_with_bots(pool);
    const app = create_dashboard_test_app(pool);

    const response = await request(app)
      .get(`/dashboard/accounts/${account_id}/bots`)
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

    // La página de Bots ofrece el alta con tabs (Bot Nuevo | Bot preconfigurado),
    // los preconfigurados como tarjetas seleccionables (no dropdown) y con buscador.
    const page = await request(app).get(`${base}/bots`).expect(200);
    expect(page.text).toContain("Agregar bot");
    expect(page.text).toContain('data-section="custom"');
    expect(page.text).toContain('data-section="system"');
    expect(page.text).toContain("Bot Nuevo");
    expect(page.text).toContain("Bot preconfigurado");
    expect(page.text).toContain("system-bot-pick");
    expect(page.text).toContain("system_bot_search");
    expect(page.text).not.toContain("system_bot_picker");

    // Custom desde cero → draft del tipo custom en esta cuenta; redirige directo al
    // editor del bot recién creado (`/inspector/bots/:id`) para configurarlo.
    await request(app)
      .post(`${base}/bots`)
      .type("form")
      .send({ name: "Bot Dashboard Custom" })
      .expect(302)
      .expect("Location", /^\/inspector\/bots\/[0-9a-f-]+$/);
    const custom = (await pool.query("SELECT * FROM bots WHERE slug = 'bot-dashboard-custom' LIMIT 1")).rows[0];
    expect(custom).toBeTruthy();
    expect(custom.status).toBe("draft");
    expect(custom.bot_type).toBe("custom");
    expect(custom.account_id).toBe(account_id);
    const refreshed = await request(app).get(`${base}/bots`).expect(200);
    expect(refreshed.text).toContain("Bot Dashboard Custom");

    // Desde bot de sistema → clon custom en draft, sin knowledge ni grupos de la
    // cuenta origen. El clon se identifica por `settings_json.cloned_from_bot_id`
    // (su slug se deriva del nombre, no del slug origen).
    const system_bot = (
      await pool.query("SELECT id, name, slug FROM bots WHERE bot_type = 'system' AND status = 'active' LIMIT 1")
    ).rows[0];
    expect(system_bot).toBeTruthy();
    await request(app).post(`${base}/bots`).type("form").send({ source_bot_id: system_bot.id }).expect(302);
    const clone = (
      await pool.query("SELECT * FROM bots WHERE settings_json->>'cloned_from_bot_id' = $1 LIMIT 1", [system_bot.id])
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

    // La página de Canales ofrece el alta con tabs WhatsApp | Instagram (coming soon).
    const page = await request(app).get(`${base}/channels`).expect(200);
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
      .expect("Location", `${base}/channels`);

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

    const refreshed = await request(app).get(`${base}/channels`).expect(200);
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

  it("surfaces unresolved messages at the account level (metric + owner-facing review page)", async () => {
    const { account_id } = await seed_pending_review(pool, { slug: "envios", reason: "¿Hacen envíos a Monterrey?" });
    const app = create_dashboard_test_app(pool);

    // El dashboard muestra la métrica "Sin resolver" enlazando a la review de la cuenta.
    const dash = await request(app).get(`/dashboard/accounts/${account_id}`).expect(200);
    expect(dash.text).toContain(`href="/dashboard/accounts/${account_id}/review"`);
    expect(dash.text).toContain("Sin resolver");

    // La página (owner-facing) lista el pendiente y ofrece responder + enseñar.
    const review = await request(app).get(`/dashboard/accounts/${account_id}/review`).expect(200);
    expect(review.text).toContain("Mensajes sin resolver");
    expect(review.text).toContain("¿Hacen envíos a Monterrey?");
    expect(review.text).toContain("Tu respuesta");
    expect(review.text).toContain('name="learn"');
  });

  it("lets the owner resolve and teach from the account-level review", async () => {
    const { account_id, item_id } = await seed_pending_review(pool, { slug: "estacion", reason: "¿Tienen estacionamiento?" });
    const app = create_dashboard_test_app(pool);

    await request(app)
      .post(`/dashboard/accounts/${account_id}/review/${item_id}/resolve`)
      .type("form")
      .send({ note: "Sí, hay estacionamiento gratis para clientes.", learn: "on" })
      .expect(302)
      .expect("Location", `/dashboard/accounts/${account_id}/review`);

    // Quedó resuelto y aprendido como conocimiento del negocio (reusa review_service).
    const resolved = (await pool.query("SELECT status, resolution_json FROM review_items WHERE id = $1", [item_id])).rows[0];
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolution_json.learned).toBe(true);
    const doc = (
      await pool.query(
        "SELECT content FROM memory_documents WHERE account_id = $1 AND document_type = 'business_faq' LIMIT 1",
        [account_id],
      )
    ).rows[0];
    expect(doc.content).toContain("estacionamiento gratis");

    // Ya no aparece como pendiente en la review de la cuenta.
    const review = await request(app).get(`/dashboard/accounts/${account_id}/review`).expect(200);
    expect(review.text).not.toContain("¿Tienen estacionamiento?");
    expect(review.text).toContain("Todo al día");
  });
});
