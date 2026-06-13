import express from "express";
import path from "node:path";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { register_review_routes } from "../../src/review/review_routes.js";
import { format_money } from "../../src/shared/money.js";
import { format_date_es, format_datetime_es } from "../../src/shared/dates.js";
import { create_test_pool } from "../helpers/test_pool.js";

function create_review_test_app(pool) {
  const app = express();
  const router = express.Router();

  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.date = format_date_es;
  app.locals.datetime = format_datetime_es;
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  register_review_routes(router, { pool });
  app.use(router);
  app.use((error, _request, response, _next) => {
    response.status(500).send(error.message);
  });

  return app;
}

// Creates a second account (in the seeded org) with its own bot, plus a pending
// review item attached to a fresh message — enough to prove cross-account filtering.
async function seed_account_with_review(pool, { organization_id, name, slug, reason }) {
  const account = (
    await pool.query(
      "INSERT INTO accounts (organization_id, name, slug, status) VALUES ($1, $2, $3, 'active') RETURNING *",
      [organization_id, name, slug],
    )
  ).rows[0];
  const bot = (
    await pool.query(
      `
        INSERT INTO bots (organization_id, account_id, name, slug, bot_type, status)
        VALUES ($1, $2, $3, $4, 'whatsapp', 'active')
        RETURNING *
      `,
      [organization_id, account.id, `Bot ${name}`, `bot-${slug}`],
    )
  ).rows[0];
  const contact = (
    await pool.query(
      "INSERT INTO contacts (account_id, organization_id, whatsapp_phone, display_name) VALUES ($1, $2, $3, $4) RETURNING *",
      [account.id, organization_id, `5215550${slug.replace(/\D/g, "").padStart(6, "0").slice(-6)}`, name],
    )
  ).rows[0];
  const conversation = (
    await pool.query(
      `
        INSERT INTO conversations (account_id, organization_id, bot_id, contact_id, channel, last_message_at)
        VALUES ($1, $2, $3, $4, 'whatsapp', now())
        RETURNING *
      `,
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
        RETURNING *
      `,
      [account.id, organization_id, bot.id, conversation.id, contact.id, `review-${slug}`, reason],
    )
  ).rows[0];
  await pool.query(
    `
      INSERT INTO review_items (account_id, organization_id, bot_id, message_id, reason, status, raw_text)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
    `,
    [account.id, organization_id, bot.id, message.id, reason, reason],
  );

  return { account, bot };
}

describe("Review queue", () => {
  let pool;

  before_each(async () => {
    pool = await create_test_pool();
  });

  after_each(async () => {
    await pool?.end();
  });

  it("scopes pending items to an account when ?account= is present", async () => {
    const organization_id = (await pool.query("SELECT id FROM organizations LIMIT 1")).rows[0].id;
    const first = await seed_account_with_review(pool, {
      organization_id,
      name: "Sucursal Centro",
      slug: "sucursal-centro",
      reason: "Confianza baja Centro",
    });
    const second = await seed_account_with_review(pool, {
      organization_id,
      name: "Sucursal Norte",
      slug: "sucursal-norte",
      reason: "Confianza baja Norte",
    });
    const app = create_review_test_app(pool);

    // Unscoped: both pending items show.
    const all = await request(app).get("/review").expect(200);
    expect(all.text).toContain("Confianza baja Centro");
    expect(all.text).toContain("Confianza baja Norte");
    expect(all.text).not.toContain("scope-banner");

    // Scoped to the first account: only its item, plus the scope banner + a way out.
    const scoped = await request(app).get(`/review?account=${first.account.id}`).expect(200);
    expect(scoped.text).toContain("Confianza baja Centro");
    expect(scoped.text).not.toContain("Confianza baja Norte");
    expect(scoped.text).toContain("scope-banner");
    expect(scoped.text).toContain("Sucursal Centro");

    // Scoped to the second account: only its item.
    const scoped_second = await request(app).get(`/review?account=${second.account.id}`).expect(200);
    expect(scoped_second.text).toContain("Confianza baja Norte");
    expect(scoped_second.text).not.toContain("Confianza baja Centro");
  });

  it("auto-learns a human resolution as reusable business knowledge (opt-out)", async () => {
    const organization_id = (await pool.query("SELECT id FROM organizations LIMIT 1")).rows[0].id;
    const { account } = await seed_account_with_review(pool, {
      organization_id,
      name: "Sucursal Aprende",
      slug: "sucursal-aprende",
      reason: "¿Tienen estacionamiento?",
    });
    const item = (await pool.query("SELECT id FROM review_items WHERE account_id = $1 LIMIT 1", [account.id])).rows[0];
    const app = create_review_test_app(pool);

    // El form de review ofrece el checkbox de aprender (marcado por default).
    const page = await request(app).get(`/review?account=${account.id}`).expect(200);
    expect(page.text).toContain('name="learn"');
    expect(page.text).toContain("Guardar como conocimiento del negocio");

    await request(app)
      .post(`/review/${item.id}/resolve`)
      .type("form")
      .send({ note: "Sí, hay estacionamiento gratis para clientes.", learn: "on" })
      .expect(302);

    // Quedó como knowledge_source (visible/removible en Knowledge Center) y como
    // memory_document business_faq (recuperable por el bot).
    const source = (
      await pool.query(
        "SELECT * FROM knowledge_sources WHERE account_id = $1 AND origin = 'learned_from_review' LIMIT 1",
        [account.id],
      )
    ).rows[0];
    expect(source).toBeTruthy();
    expect(source.source_family).toBe("business_knowledge");

    const doc = (
      await pool.query(
        "SELECT * FROM memory_documents WHERE account_id = $1 AND document_family = 'business_knowledge' AND document_type = 'business_faq' LIMIT 1",
        [account.id],
      )
    ).rows[0];
    expect(doc).toBeTruthy();
    expect(doc.content).toContain("estacionamiento gratis");

    // La resolución quedó marcada como aprendida.
    const resolved = (await pool.query("SELECT resolution_json FROM review_items WHERE id = $1", [item.id])).rows[0];
    expect(resolved.resolution_json.learned).toBe(true);
  });

  it("does not learn when the opt-out checkbox is off", async () => {
    const organization_id = (await pool.query("SELECT id FROM organizations LIMIT 1")).rows[0].id;
    const { account } = await seed_account_with_review(pool, {
      organization_id,
      name: "Sucursal Sin Aprender",
      slug: "sucursal-sin-aprender",
      reason: "Pregunta puntual",
    });
    const item = (await pool.query("SELECT id FROM review_items WHERE account_id = $1 LIMIT 1", [account.id])).rows[0];
    const app = create_review_test_app(pool);

    // Sin el campo learn (checkbox desmarcado): se resuelve sin aprender.
    await request(app)
      .post(`/review/${item.id}/resolve`)
      .type("form")
      .send({ note: "Respuesta única, no generalizable." })
      .expect(302);

    const source = await pool.query(
      "SELECT * FROM knowledge_sources WHERE account_id = $1 AND origin = 'learned_from_review'",
      [account.id],
    );
    expect(source.rowCount).toBe(0);
    const resolved = (await pool.query("SELECT resolution_json FROM review_items WHERE id = $1", [item.id])).rows[0];
    expect(resolved.resolution_json.learned).toBe(false);
  });
});
