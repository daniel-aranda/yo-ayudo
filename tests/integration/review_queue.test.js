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
});
