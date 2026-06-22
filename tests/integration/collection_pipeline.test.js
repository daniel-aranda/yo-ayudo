import { rmSync as rm_sync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mock_provider } from "../../src/ai/mock_provider.js";
import { COLLECTION_DEFAULT_QUESTIONS } from "../../src/ai/mock_provider.js";
import { create_simulated_whatsapp_payload } from "../../src/channels/whatsapp/whatsapp_message_parser.js";
import { handle_whatsapp_webhook_payload } from "../../src/engine/message_processor.js";
import { local_memory_store } from "../../src/memory/local_memory_store.js";
import { config } from "../../src/app/config.js";
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

function simulate(pool, client, text, options = {}) {
  return handle_whatsapp_webhook_payload(
    create_simulated_whatsapp_payload({ from: "5215550000000", text, message_id: options.message_id }),
    {
      pool,
      provider: new mock_provider(),
      whatsapp_client: client,
      memory_store: new local_memory_store({ base_dir: ".storage/test-collection-memory" }),
    },
  );
}

// Habilita la interacción de recolección (y generar_documento) en el bot que
// atiende el número demo. Sin jsonb_set (pg-mem): read-merge-write del definition.
async function enable_collection(pool, { auto_generate = false } = {}) {
  const row = (
    await pool.query(
      `SELECT b.id, b.definition_json FROM whatsapp_phone_numbers w
       JOIN phone_number_bot_assignments a ON a.whatsapp_phone_number_id = w.id AND a.status = 'active' AND a.active_key = 'active'
       JOIN bots b ON b.id = a.bot_id
       WHERE w.phone_number_id = $1 LIMIT 1`,
      [config.whatsapp_phone_number_id],
    )
  ).rows[0];
  const interactions = [
    {
      type: "recolectar_informacion",
      action_id: "recolectar_informacion",
      enabled: true,
      instructions: "Arma una propuesta de bot para el negocio del vendedor.",
      options: { generar_documento_al_terminar: auto_generate },
    },
    { type: "generar_documento", action_id: "generar_documento", enabled: true, instructions: "" },
  ];
  const definition = { ...(row.definition_json ?? {}), interactions };
  await pool.query("UPDATE bots SET definition_json = $2::jsonb, acciones_habilitadas_json = $3::jsonb WHERE id = $1", [
    row.id,
    JSON.stringify(definition),
    JSON.stringify(["recolectar_informacion", "generar_documento"]),
  ]);
  return row.id;
}

async function get_session(pool) {
  return (await pool.query("SELECT * FROM information_collection_sessions ORDER BY created_at DESC LIMIT 1")).rows[0];
}

describe("recolectar información: entrevista multi-turno con memoria viva", () => {
  let pool;
  let client;
  beforeEach(async () => {
    rm_sync(".storage/test-collection-memory", { recursive: true, force: true });
    pool = await create_test_pool();
    client = new fake_whatsapp_client();
  });
  afterEach(async () => {
    await pool?.end();
    rm_sync(".storage/test-collection-memory", { recursive: true, force: true });
  });

  it("arranca la entrevista por frase y hace la primera pregunta", async () => {
    await enable_collection(pool);
    await simulate(pool, client, "arma una propuesta para mi taquería", { message_id: "c-1" });
    expect(client.sent_messages.at(-1)?.body).toBe(COLLECTION_DEFAULT_QUESTIONS[0]);
    const session = await get_session(pool);
    expect(session).toMatchObject({ status: "collecting", turn_count: 0 });
    expect(session.last_question).toBe(COLLECTION_DEFAULT_QUESTIONS[0]);
  });

  it("avanza con cada respuesta: acumula findings y deriva la siguiente pregunta", async () => {
    await enable_collection(pool);
    await simulate(pool, client, "arma una propuesta", { message_id: "c-1" });
    await simulate(pool, client, "pierdo clientes porque no contesto rápido", { message_id: "c-2" });
    expect(client.sent_messages.at(-1)?.body).toBe(COLLECTION_DEFAULT_QUESTIONS[1]);
    const session = await get_session(pool);
    expect(session.turn_count).toBe(1);
    expect(session.findings_json.notes).toContain("pierdo clientes porque no contesto rápido");
  });

  it("CAPTURA la conversación: un 'vendimos 3200' en medio es respuesta, no una venta", async () => {
    await enable_collection(pool);
    await simulate(pool, client, "arma una propuesta", { message_id: "c-1" });
    await simulate(pool, client, "vendimos 3200 hoy", { message_id: "c-2" });
    const sales = await pool.query("SELECT * FROM op_sales_updates");
    expect(sales.rowCount).toBe(0); // NO se registró como venta: la sesión capturó el mensaje
    const session = await get_session(pool);
    expect(session.status).toBe("collecting");
    expect(session.findings_json.notes).toContain("vendimos 3200 hoy");
  });

  it("cierra cuando el vendedor lo pide y deja el resultado en cola (ready)", async () => {
    await enable_collection(pool);
    await simulate(pool, client, "arma una propuesta", { message_id: "c-1" });
    await simulate(pool, client, "me duele la atención", { message_id: "c-2" });
    await simulate(pool, client, "ya con eso, gracias", { message_id: "c-3" });
    const session = await get_session(pool);
    expect(session.status).toBe("ready");
    expect(session.completion_reason).toBe("user_requested");
    const reply = client.sent_messages.at(-1)?.body ?? "";
    expect(reply).toContain("Esto es lo que tengo");
  });

  it("Modo B: 'genera el documento' consume el resultado ready (pending_provider honesto)", async () => {
    await enable_collection(pool);
    await simulate(pool, client, "arma una propuesta", { message_id: "c-1" });
    await simulate(pool, client, "ya, con eso basta", { message_id: "c-2" });
    expect((await get_session(pool)).status).toBe("ready");

    await simulate(pool, client, "ahora genera el documento de eso", { message_id: "c-3" });
    const reply = client.sent_messages.at(-1)?.body ?? "";
    expect(reply.toLowerCase()).toContain("pendiente de proveedor");
    expect((await get_session(pool)).status).toBe("completed"); // consumido
  });

  it("Modo A: al cerrar, dispara generar_documento automáticamente", async () => {
    await enable_collection(pool, { auto_generate: true });
    await simulate(pool, client, "arma una propuesta", { message_id: "c-1" });
    await simulate(pool, client, "ya con eso", { message_id: "c-2" });
    const reply = client.sent_messages.at(-1)?.body ?? "";
    expect(reply.toLowerCase()).toContain("pendiente de proveedor"); // se intentó generar al cerrar
    expect((await get_session(pool)).status).toBe("ready");
  });

  it("es idempotente: un reenvío con el mismo id no avanza la sesión dos veces", async () => {
    await enable_collection(pool);
    await simulate(pool, client, "arma una propuesta", { message_id: "c-1" });
    await simulate(pool, client, "respuesta uno", { message_id: "c-2" });
    const before = (await get_session(pool)).turn_count;
    await simulate(pool, client, "respuesta uno", { message_id: "c-2" }); // reenvío
    const after = (await get_session(pool)).turn_count;
    expect(after).toBe(before);
  });
});
