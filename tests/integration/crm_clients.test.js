import path from "node:path";
import { rmSync as rm_sync } from "node:fs";
import express from "express";
import request from "supertest";
import { afterEach as after_each, beforeEach as before_each, describe, expect, it } from "vitest";
import { action_execution_service } from "../../src/actions/action_execution_service.js";
import { get_action } from "../../src/actions/action_registry.js";
import { bot_engine_test_service } from "../../src/bot_engine/bot_engine_test_service.js";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { create_simulated_whatsapp_payload } from "../../src/channels/whatsapp/whatsapp_message_parser.js";
import { handle_whatsapp_webhook_payload } from "../../src/engine/message_processor.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { get_conversation_view } from "../../src/inspector/inspector_repository.js";
import { register_inspector_routes } from "../../src/inspector/inspector_routes.js";
import { navigation_context } from "../../src/app/navigation_middleware.js";
import {
  format_phone,
  json_text,
  message_alignment,
  present_conversation_turns,
} from "../../src/inspector/inspector_presenter.js";
import { format_money } from "../../src/shared/money.js";
import { format_date_es, format_datetime_es } from "../../src/shared/dates.js";
import {
  derive_client_key,
  list_crm_clients_for_account,
  normalize_identifiers,
  upsert_crm_client,
} from "../../src/crm/crm_repository.js";
import { parse_lead_fields } from "../../src/crm/lead_text_parser.js";
import { create_test_pool } from "../helpers/test_pool.js";

class fake_whatsapp_client {
  sent_messages = [];

  async send_text(input) {
    this.sent_messages.push(input);
    return { sent: true, external_message_id: `fake-${this.sent_messages.length}`, raw_response: { ok: true } };
  }

  async send_template() {
    return { sent: false, raw_response: { skipped: true } };
  }
}

async function load_context(pool) {
  const account = (await pool.query("SELECT * FROM accounts WHERE slug = 'yoayudo-ventas' LIMIT 1")).rows[0];
  const crm_bot = (await pool.query("SELECT * FROM bots WHERE slug = 'agente-whatsapp-yoayudo' LIMIT 1")).rows[0];
  const bare_bot = (await pool.query("SELECT * FROM bots WHERE slug = 'bot-whatsapp-yoayudo' LIMIT 1")).rows[0];
  return { account, organization_id: account.organization_id, account_id: account.id, crm_bot, bare_bot };
}

function create_inspector_app(pool) {
  const app = express();
  const router = express.Router();
  app.set("view engine", "pug");
  app.set("views", path.join(process.cwd(), "src", "web", "views"));
  app.locals.money = format_money;
  app.locals.date = format_date_es;
  app.locals.datetime = format_datetime_es;
  app.locals.json = json_text;
  app.locals.message_alignment = message_alignment;
  app.locals.phone = format_phone;
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(navigation_context);
  register_inspector_routes(router, { pool });
  app.use(router);
  app.use((error, _request, response, _next) => response.status(500).send(error.message));
  return app;
}

describe("CRM clients (prospectos y clientes)", () => {
  let pool;

  before_each(async () => {
    rm_sync(".storage/test-crm-memory", { recursive: true, force: true });
    pool = await create_test_pool();
  });

  after_each(async () => {
    await pool?.end();
    rm_sync(".storage/test-crm-memory", { recursive: true, force: true });
  });

  it("derives the business key by priority CURP > phone > instagram > email and normalizes identifiers", () => {
    expect(derive_client_key({ phone: "5551234567" })).toMatchObject({ client_key: "5551234567", client_key_type: "phone" });
    expect(derive_client_key({ phone: "555", curp: "ABCD" })).toMatchObject({ client_key: "ABCD", client_key_type: "curp" });
    expect(derive_client_key({ instagram: "tienda", email: "x@y.com" })).toMatchObject({ client_key_type: "instagram" });
    expect(derive_client_key({ email: "x@y.com" })).toMatchObject({ client_key_type: "email" });
    expect(derive_client_key({ id: "abc" })).toMatchObject({ client_key: "abc", client_key_type: "internal" });

    expect(normalize_identifiers({ telefono: "+52 (1) 555-123-4567", instagram: "@MiTienda", curp: " perj900101hdfrrn09 " })).toEqual({
      curp: "PERJ900101HDFRRN09",
      phone: "5215551234567",
      instagram: "mitienda",
      email: null,
    });
  });

  it("upserts by identity: a re-save with a higher-priority id keeps the same record and upgrades the key", async () => {
    const { account_id, organization_id } = await load_context(pool);

    const first = await upsert_crm_client(pool, { account_id, organization_id, display_name: "Ana", phone: "55-1234-5678" });
    expect(first.created).toBe(true);
    expect(first.client_key_type).toBe("phone");
    expect(first.client_key).toBe("5512345678");

    // Same person, now with CURP — resolved by phone, key mutates to CURP, id stable.
    const upgraded = await upsert_crm_client(pool, { account_id, organization_id, phone: "5512345678", curp: "anaa900101mdfxxx09" });
    expect(upgraded.created).toBe(false);
    expect(upgraded.id).toBe(first.id);
    expect(upgraded.client_key_type).toBe("curp");
    expect(upgraded.client_key).toBe("ANAA900101MDFXXX09");
    expect(upgraded.display_name).toBe("Ana");

    const all = await list_crm_clients_for_account(pool, account_id);
    expect(all).toHaveLength(1);
  });

  it("dedupes across channels: an Instagram lead resolves to the same record when re-saved", async () => {
    const { account_id, organization_id } = await load_context(pool);

    const ig = await upsert_crm_client(pool, { account_id, organization_id, display_name: "Boutique", instagram: "@MiBoutique" });
    expect(ig.client_key_type).toBe("instagram");
    expect(ig.client_key).toBe("miboutique");

    const merged = await upsert_crm_client(pool, { account_id, organization_id, instagram: "miboutique", curp: "BOUT900101MDFXXX01" });
    expect(merged.id).toBe(ig.id);
    expect(merged.client_key_type).toBe("curp");
    expect((await list_crm_clients_for_account(pool, account_id))).toHaveLength(1);
  });

  it("supports the lead -> client lifecycle (kind + pipeline_status)", async () => {
    const { account_id, organization_id } = await load_context(pool);

    const lead = await upsert_crm_client(pool, {
      account_id,
      organization_id,
      display_name: "Taller Z",
      phone: "5550009999",
      kind: "prospecto",
      status: "nuevo",
    });
    expect(lead.kind).toBe("prospecto");
    expect(lead.pipeline_status).toBe("nuevo");

    const won = await upsert_crm_client(pool, { account_id, organization_id, phone: "5550009999", kind: "cliente", status: "cerrado_ganado" });
    expect(won.id).toBe(lead.id);
    expect(won.kind).toBe("cliente");
    expect(won.pipeline_status).toBe("cerrado_ganado");
  });

  it("captures a prospect with no name yet, then fills the name on a later save (same record)", async () => {
    const { account_id, organization_id } = await load_context(pool);

    // Lead arrives without a name: saved by phone, display_name still unknown
    // (this is when the bot should ASK for the name).
    const unnamed = await upsert_crm_client(pool, {
      account_id,
      organization_id,
      phone: "5215550000555",
      kind: "prospecto",
      source: "Campaña Facebook",
    });
    expect(unnamed.created).toBe(true);
    expect(unnamed.display_name).toBeNull();
    expect(unnamed.client_key_type).toBe("phone");

    // The lead replies with the name → same record (resolved by phone) gets it.
    const named = await upsert_crm_client(pool, {
      account_id,
      organization_id,
      phone: "5215550000555",
      display_name: "Daniela Ruiz",
    });
    expect(named.created).toBe(false);
    expect(named.id).toBe(unnamed.id);
    expect(named.display_name).toBe("Daniela Ruiz");
    expect(named.source).toBe("Campaña Facebook"); // earlier data preserved
    expect(await list_crm_clients_for_account(pool, account_id)).toHaveLength(1);
  });

  it("executes the crear_contacto interaction from a test message and persists the prospect", async () => {
    const { account_id, organization_id, crm_bot } = await load_context(pool);
    const tester = new bot_engine_test_service({ pool, provider: new mock_provider() });

    const result = await tester.test_message({
      organization_id,
      account_id,
      bot_id: crm_bot.id,
      modo_test: true,
      mensaje: "Registra al prospecto Juan Pérez, su CURP es PERJ900101HDFRRN09 y su Instagram @juanperez. Quiere automatizar su clínica.",
    });

    expect(result.actions_ejecutadas.map((a) => a.action_id)).toContain("crear_contacto");
    const crm_output = result.actions_ejecutadas.find((a) => a.action_id === "crear_contacto").output;
    expect(crm_output.client_key_type).toBe("curp");
    expect(crm_output.client_key).toBe("PERJ900101HDFRRN09");

    const clients = await list_crm_clients_for_account(pool, account_id);
    const juan = clients.find((c) => c.curp === "PERJ900101HDFRRN09");
    expect(juan).toBeTruthy();
    expect(juan.instagram).toBe("juanperez");
    expect(juan.display_name).toBe("Juan Pérez");
    expect(juan.kind).toBe("prospecto");

    // The interaction is configured as a business-language capability.
    expect(get_action("crear_contacto").nombre).toBe("Guardar prospecto o cliente");
    expect(juan.bot_id).toBe(crm_bot.id);
  });

  it("blocks crear_contacto for a bot that hasn't enabled it and persists nothing", async () => {
    const { account_id, organization_id, bare_bot } = await load_context(pool);
    const actions = new action_execution_service({ pool });

    const result = await actions.execute_action({
      organization_id,
      account_id,
      bot_id: bare_bot.id,
      action_id: "crear_contacto",
      input_json: { nombre: "Prospecto Bloqueado", telefono: "5551112222" },
      actor_type: "bot",
    });

    expect(result.status).toBe("blocked");
    expect(result.guardrail_events.map((event) => event.tipo)).toContain("accion_no_habilitada");
    expect(await list_crm_clients_for_account(pool, account_id)).toHaveLength(0);
  });

  it("captures a lead from an inbound WhatsApp message, inheriting the sender's number and linking the conversation", async () => {
    const { account_id } = await load_context(pool);
    const client = new fake_whatsapp_client();

    const results = await handle_whatsapp_webhook_payload(
      create_simulated_whatsapp_payload({ from: "5215550000000", text: "Hola, registra al prospecto Marisol, quiere info de precios." }),
      {
        pool,
        provider: new mock_provider(),
        whatsapp_client: client,
        memory_store: new local_memory_store({ base_dir: ".storage/test-crm-memory" }),
      },
    );

    expect(results[0].intents).toContain("lead_capture");

    const clients = await list_crm_clients_for_account(pool, account_id);
    expect(clients).toHaveLength(1);
    const lead = clients[0];
    expect(lead.phone).toBe("5215550000000");
    expect(lead.client_key_type).toBe("phone");
    expect(lead.contact_id).toBeTruthy();
    expect(lead.conversation_id).toBeTruthy();
    expect(lead.kind).toBe("prospecto");
    expect(client.sent_messages[0]?.body).toContain("Prospecto registrado");

    const audit = await pool.query("SELECT * FROM action_audit_logs WHERE action_id = 'crear_contacto' AND status = 'executed'");
    expect(audit.rowCount).toBe(1);
  });

  it("surfaces the captured prospect in the conversation value summary", async () => {
    const { account_id } = await load_context(pool);
    const client = new fake_whatsapp_client();

    await handle_whatsapp_webhook_payload(
      create_simulated_whatsapp_payload({ from: "5215550000000", text: "registra al prospecto Marisol con curp MARM900101MDFXXX03" }),
      {
        pool,
        provider: new mock_provider(),
        whatsapp_client: client,
        memory_store: new local_memory_store({ base_dir: ".storage/test-crm-memory" }),
      },
    );

    const conversation = await pool.query("SELECT id FROM conversations ORDER BY created_at DESC LIMIT 1");
    const view = await get_conversation_view(pool, conversation.rows[0].id);

    expect(view.value_summary.has_value).toBe(true);
    expect(view.value_summary.crm).toHaveLength(1);
    expect(view.value_summary.crm[0].client_key_type).toBe("curp");
    expect(view.value_summary.crm[0].display_name).toBe("Marisol");
  });

  it("attaches the captured client to its crear_contacto turn chip (for the 'Ver prospecto' combo)", () => {
    const turns = [
      {
        id: "m1",
        incoming: {
          message: { id: "m1", text_body: "registra al prospecto Ana", created_at: "2026-06-10T10:00:00Z" },
          compact_trace_summary: {
            intent: "lead_capture",
            confidence: 0.9,
            interactions: [{ action_id: "crear_contacto", label: "Guardar prospecto o cliente", status: "executed", output_json: { cliente_id: "client-123" } }],
          },
        },
        responses: [],
      },
    ];
    const clients = [{ id: "client-123", display_name: "Ana", kind: "prospecto", client_key: "555", client_key_type: "phone" }];
    const [turn] = present_conversation_turns(turns, { clients });
    const action = turn.understanding.actions.find((a) => a.action_id === "crear_contacto");
    expect(action.client).toMatchObject({ id: "client-123", display_name: "Ana", kind: "prospecto" });
  });

  it("renders the conversation with a 'Ver prospecto' affordance and the standalone CRM detail page", async () => {
    const { account_id } = await load_context(pool);
    const app = create_inspector_app(pool);
    const client = new fake_whatsapp_client();

    await handle_whatsapp_webhook_payload(
      create_simulated_whatsapp_payload({ from: "5215550000000", text: "registra al prospecto Marisol con curp MARM900101MDFXXX03" }),
      { pool, provider: new mock_provider(), whatsapp_client: client, memory_store: new local_memory_store({ base_dir: ".storage/test-crm-memory" }) },
    );

    const lead = (await list_crm_clients_for_account(pool, account_id))[0];
    const conversation = await pool.query("SELECT id FROM conversations ORDER BY created_at DESC LIMIT 1");

    const conv_page = await request(app)
      .get(`/inspector/accounts/${account_id}/conversations/${conversation.rows[0].id}`)
      .expect(200);
    expect(conv_page.text).toContain("Ver prospecto");
    expect(conv_page.text).toContain(`data-open-client="${lead.id}"`);
    expect(conv_page.text).toContain("data-client-popup");

    const detail = await request(app).get(`/inspector/crm/${lead.id}`).expect(200);
    expect(detail.text).toContain("Marisol");
    expect(detail.text).toContain("Clave de negocio");
    expect(detail.text).toContain("CURP");
    expect(detail.text).toContain("yoayudo:crm-height");

    await request(app).get("/inspector/crm/00000000-0000-0000-0000-000000000000").expect(404);
  });

  it("parses lead identifiers from free text without leaking the CURP digits into the phone", () => {
    const fields = parse_lead_fields("prospecto Carlos Ibáñez, su curp es IABC910320HDFBRR05, tel 5215557654321, ig @carlos.i");
    expect(fields.curp).toBe("IABC910320HDFBRR05");
    expect(fields.phone).toBe("5215557654321");
    expect(fields.instagram).toBe("carlos.i");
    expect(fields.display_name).toBe("Carlos Ibáñez");
  });
});
