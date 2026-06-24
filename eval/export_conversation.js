import { mkdirSync as mkdir_sync, writeFileSync as write_file_sync } from "node:fs";
import path from "node:path";
import { create_pool } from "../src/db/client.js";
import { get_conversation_view } from "../src/inspector/inspector_repository.js";

// Convierte una conversación REAL en un fixture del eval (golden conversation).
// Toma los mensajes del usuario como `turns` y PRECARGA el `expect` con lo que el
// bot hizo HOY (punto de partida). Tú lo editas a lo ESPERADO y entra al corpus
// como `baseline_failing` para volverla verde. SOLO LECTURA del DB.
//
//   npm run convo:export -- <id-o-url>            # escribe eval/conversations/<slug>.json
//   npm run convo:export -- <id-o-url> --stdout   # solo imprime

function extract_id(arg) {
  const text = String(arg ?? "");
  const after = text.match(/conversations\/([0-9a-fA-F-]{36})/);
  if (after) return after[1];
  const any = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  return any ? any[0] : null;
}

function slugify(value, fallback) {
  return (
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || fallback
  );
}

async function main() {
  const args = process.argv.slice(2);
  const to_stdout = args.includes("--stdout");
  const id = extract_id(args.join(" "));
  if (!id) {
    console.error("Pásame un id o URL de conversación.");
    process.exitCode = 1;
    return;
  }

  const pool = create_pool();
  try {
    const view = await get_conversation_view(pool, id);
    if (!view.conversation) {
      console.error(`No encontré la conversación ${id} (¿DB correcto? DATABASE_URL).`);
      process.exitCode = 1;
      return;
    }
    const conv = view.conversation;
    const contact = (await pool.query("SELECT channel, external_id, whatsapp_phone, display_name FROM contacts WHERE id = $1", [conv.contact_id])).rows[0] ?? {};
    const channel = conv.channel || contact.channel || "whatsapp";
    const from = contact.external_id || contact.whatsapp_phone || conv.whatsapp_phone || "5215550000000";

    const turns = view.turns
      .filter((turn) => turn.incoming)
      .map((turn) => {
        const trace = turn.incoming.compact_trace_summary ?? {};
        const actual_actions = (trace.interactions ?? []).map((ix) => ({ action_id: ix.action_id, status: ix.status }));
        // `expect` precargado con lo que pasó HOY — edítalo a lo ESPERADO.
        const expect = {};
        if (trace.intent) expect.intents = [trace.intent];
        if (actual_actions.length) expect.actions = actual_actions;
        return {
          user: turn.incoming.message.text_body || "",
          _bot_respondio_hoy: turn.responses?.[0]?.message?.text_body ?? null,
          expect,
        };
      });

    const slug = slugify(contact.display_name || conv.display_name, `conv-${id.slice(0, 8)}`);
    const fixture = {
      name: slug,
      description: `Exportada de la conversación real ${id}. AJUSTA cada 'expect' a lo ESPERADO (hoy trae lo que el bot hizo) y revisa 'expect_final'.`,
      status: "baseline_failing",
      tags: ["importada", channel],
      setup: { channel, from, bot: { enable: [], instructions: {} } },
      turns,
      expect_final: { db: [] },
    };

    const json = JSON.stringify(fixture, null, 2);
    if (to_stdout) {
      console.log(json);
      return;
    }
    const dir = path.join("eval", "conversations");
    mkdir_sync(dir, { recursive: true });
    const out = path.join(dir, `${slug}.json`);
    write_file_sync(out, json + "\n");
    console.log(`Fixture escrito: ${out}`);
    console.log(`Edita los 'expect' a lo ESPERADO y corre: npm run eval -- --name=${slug}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
