import { create_pool } from "../src/db/client.js";
import { get_conversation_view } from "../src/inspector/inspector_repository.js";

// Debuggea una conversación REAL (la que ya pasó) leyéndola del DB y mostrando el
// trace turno por turno: intents, confianza, acciones+status, respuesta, llamadas
// de IA fallidas, guardrails y la sesión de recolección. Reusa get_conversation_view
// (la misma verdad que el inspector). Es de SOLO LECTURA.
//
//   npm run convo:explain -- <id-o-url>
//   DATABASE_URL=... npm run convo:explain -- http://localhost:4000/inspector/.../conversations/<id>

const C = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };
const paint = (c, t) => `${C[c]}${t}${C.reset}`;

function extract_id(arg) {
  const text = String(arg ?? "");
  const after = text.match(/conversations\/([0-9a-fA-F-]{36})/);
  if (after) return after[1];
  const any = text.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  return any ? any[0] : null;
}

async function query_safe(pool, sql, params) {
  try {
    return (await pool.query(sql, params)).rows;
  } catch {
    return [];
  }
}

async function main() {
  const id = extract_id(process.argv.slice(2).join(" "));
  if (!id) {
    console.error(paint("red", "Pásame un id o URL de conversación. Ej: npm run convo:explain -- <url>"));
    process.exitCode = 1;
    return;
  }

  const pool = create_pool();
  try {
    const view = await get_conversation_view(pool, id);
    if (!view.conversation) {
      console.error(paint("red", `No encontré la conversación ${id} en ${process.env.DATABASE_URL ?? "el DB por defecto"}.`));
      console.error(paint("dim", "¿Apuntas al DB correcto? Ej: DATABASE_URL=postgres://yoayudo:yoayudo@127.0.0.1:5433/yoayudo"));
      process.exitCode = 1;
      return;
    }

    const conv = view.conversation;
    const message_ids = view.messages.map((m) => m.message.id);
    const placeholders = message_ids.map((_, i) => `$${i + 1}`).join(", ");
    const ai_calls = message_ids.length
      ? await query_safe(pool, `SELECT message_id, function_name, provider, model, status, error_message FROM ai_calls WHERE message_id IN (${placeholders})`, message_ids)
      : [];
    const guardrails = await query_safe(pool, "SELECT message_id, action_id, event_type, reason, detail, created_at FROM bot_guardrail_events WHERE conversation_id = $1 ORDER BY created_at", [id]);

    const ai_failed = ai_calls.filter((c) => c.status === "failed");

    console.log(`\n${paint("bold", "Conversación")}  ${paint("dim", id)}`);
    console.log(`  Contacto: ${conv.display_name || conv.whatsapp_phone || "—"}  ·  Canal: ${conv.channel}  ·  Bot: ${conv.bot_name || "—"}  ·  Cuenta: ${conv.account_name || "—"}`);
    console.log(`  Estado: ${conv.status}  ·  Turnos: ${view.turns.length}  ·  Mensajes: ${view.messages.length}\n`);

    let flags = [];
    let turn_no = 0;
    for (const turn of view.turns) {
      turn_no += 1;
      const incoming = turn.incoming;
      const trace = incoming?.compact_trace_summary ?? null;
      if (incoming) {
        console.log(`${paint("cyan", `▸ turno ${turn_no}`)}  ${paint("bold", "USUARIO:")} ${incoming.message.text_body || paint("dim", "(sin texto)")}`);
        const intent = trace?.intent ?? "—";
        const conf = trace?.confidence != null ? ` (${Math.round(Number(trace.confidence) * 100)}%)` : "";
        const actions = (trace?.interactions ?? []).map((ix) => `${ix.action_id}:${ix.status}`);
        const signals = [];
        if (trace?.needs_review) signals.push(paint("yellow", "needs_review"));
        if (trace?.has_error) signals.push(paint("red", "error"));
        if (!actions.length) signals.push(paint("dim", "sin acción"));
        console.log(`    intent: ${paint("bold", intent)}${conf}   acciones: ${actions.length ? actions.join(", ") : paint("dim", "ninguna")}   ${signals.join(" ")}`);
        if (trace?.needs_review) flags.push(`turno ${turn_no}: el bot NO supo qué hacer (needs_review)`);
        if (trace?.has_error) flags.push(`turno ${turn_no}: hubo un error en el procesamiento`);
      }
      for (const reply of turn.responses ?? []) {
        console.log(`    ${paint("green", "BOT:")} ${reply.message.text_body || paint("dim", "(sin texto)")}`);
      }
      if (incoming && !(turn.responses ?? []).length) {
        console.log(`    ${paint("yellow", "BOT: (sin respuesta)")}`);
        flags.push(`turno ${turn_no}: el bot no respondió`);
      }
      console.log("");
    }

    if (view.collection_session) {
      const s = view.collection_session;
      console.log(`${paint("bold", "Recolección")}: estado ${s.status} · turnos ${s.turn_count} · cierre ${s.completion_reason ?? "—"}`);
      const findings = s.findings_json && typeof s.findings_json === "object" ? s.findings_json : {};
      const notes = Array.isArray(findings.notes) ? findings.notes : [];
      if (notes.length) console.log(`  ${paint("dim", "findings:")} ${notes.length} puntos`);
      console.log("");
    }

    console.log(`${paint("bold", "IA")}: ${ai_calls.length} llamadas${ai_failed.length ? paint("red", ` · ${ai_failed.length} fallidas`) : ""}`);
    for (const f of ai_failed) console.log(`  ${paint("red", "✗")} ${f.function_name} (${f.provider}/${f.model}): ${f.error_message ?? ""}`);
    if (guardrails.length) {
      console.log(`${paint("bold", "Guardrails")}: ${guardrails.length}`);
      for (const g of guardrails) console.log(`  ${paint("yellow", "⚠")} ${g.action_id ?? ""} ${g.event_type ?? g.reason ?? ""} ${g.detail ? paint("dim", `· ${g.detail}`) : ""}`);
    }

    console.log(`\n${paint("bold", "Diagnóstico")}`);
    if (!flags.length && !ai_failed.length && !guardrails.length) {
      console.log(`  ${paint("green", "Sin señales de falla evidentes.")}`);
    } else {
      for (const f of flags) console.log(`  ${paint("yellow", "·")} ${f}`);
      if (ai_failed.length) console.log(`  ${paint("yellow", "·")} ${ai_failed.length} llamada(s) de IA fallaron (revisa provider/keys)`);
      if (guardrails.length) console.log(`  ${paint("yellow", "·")} ${guardrails.length} guardrail(s): una capacidad faltó, no estaba habilitada, o sin proveedor`);
    }
    console.log(`\n${paint("dim", `Para volverla un test: npm run convo:export -- ${id}`)}\n`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
