import { config } from "../src/app/config.js";
import {
  handle_whatsapp_webhook_payload,
  handle_instagram_webhook_payload,
  handle_messenger_webhook_payload,
} from "../src/engine/message_processor.js";
import { create_simulated_whatsapp_payload } from "../src/channels/whatsapp/whatsapp_message_parser.js";
import {
  create_simulated_instagram_payload,
  create_simulated_messenger_payload,
} from "../src/channels/meta_messaging_parser.js";

// Harness de evaluación de conversaciones: corre un fixture JSON por el pipeline
// REAL del engine (mismo camino que un inbound de producción) y evalúa asserts de
// "hizo lo esperado". Agnóstico de proveedor: el caller inyecta el provider (real
// para medir comportamiento de IA; mock para una corrida determinística).

const DEFAULT_RECIPIENT = {
  whatsapp: null, // el builder usa config.whatsapp_phone_number_id
  instagram: "demo-yoayudo-instagram-id",
  messenger: "demo-yoayudo-facebook-page-id",
};

const CHANNELS = {
  whatsapp: {
    handle: handle_whatsapp_webhook_payload,
    deps_key: "whatsapp_client",
    payload: ({ from, text, message_id, recipient_id }) =>
      create_simulated_whatsapp_payload({ from, text, message_id, phone_number_id: recipient_id ?? undefined }),
  },
  instagram: {
    handle: handle_instagram_webhook_payload,
    deps_key: "messaging_client",
    payload: ({ from, text, message_id, recipient_id }) =>
      create_simulated_instagram_payload({ sender_id: from, recipient_id, text, message_id, display_name: "Eval" }),
  },
  messenger: {
    handle: handle_messenger_webhook_payload,
    deps_key: "messaging_client",
    payload: ({ from, text, message_id, recipient_id }) =>
      create_simulated_messenger_payload({ sender_id: from, recipient_id, text, message_id, display_name: "Eval" }),
  },
};

function make_capture_client() {
  return {
    sent: [],
    async send_text(input) {
      this.sent.push(input);
      return { sent: true, external_message_id: `eval-${this.sent.length}`, raw_response: { ok: true } };
    },
    async send_template() {
      return { sent: false, raw_response: { skipped: true } };
    },
    async download_media() {
      return { downloaded: false, reason: "eval_no_media" };
    },
  };
}

// Resuelve el bot que atiende ese canal/recipient para aplicarle overrides.
async function resolve_bot(pool, channel, recipient_id) {
  if (channel === "whatsapp") {
    const ref = recipient_id ?? config.whatsapp_phone_number_id;
    return (
      await pool.query(
        `SELECT b.id, b.definition_json FROM whatsapp_phone_numbers w
         JOIN phone_number_bot_assignments a ON a.whatsapp_phone_number_id = w.id AND a.status='active' AND a.active_key='active'
         JOIN bots b ON b.id = a.bot_id WHERE w.phone_number_id = $1 LIMIT 1`,
        [ref],
      )
    ).rows[0];
  }
  if (channel === "instagram") {
    return (
      await pool.query(
        `SELECT b.id, b.definition_json FROM instagram_accounts ia
         JOIN instagram_account_bot_assignments a ON a.instagram_account_id = ia.id AND a.status='active' AND a.active_key='active'
         JOIN bots b ON b.id = a.bot_id WHERE ia.external_account_id = $1 LIMIT 1`,
        [recipient_id],
      )
    ).rows[0];
  }
  return (
    await pool.query(
      `SELECT b.id, b.definition_json FROM facebook_pages fp
       JOIN facebook_page_bot_assignments a ON a.facebook_page_id = fp.id AND a.status='active' AND a.active_key='active'
       JOIN bots b ON b.id = a.bot_id WHERE fp.external_page_id = $1 LIMIT 1`,
      [recipient_id],
    )
  ).rows[0];
}

// Aplica overrides del fixture al bot: habilita interacciones con su prompt/options.
async function configure_bot(pool, channel, recipient_id, bot_override) {
  if (!bot_override || !Array.isArray(bot_override.enable) || !bot_override.enable.length) {
    return;
  }
  const bot = await resolve_bot(pool, channel, recipient_id);
  if (!bot) {
    return;
  }
  const interactions = bot_override.enable.map((name) => ({
    type: name,
    action_id: name,
    enabled: true,
    instructions: bot_override.instructions?.[name] ?? "",
    options: bot_override.options?.[name] ?? {},
  }));
  const definition = { ...(bot.definition_json ?? {}), interactions };
  await pool.query("UPDATE bots SET definition_json = $2::jsonb, acciones_habilitadas_json = $3::jsonb WHERE id = $1", [
    bot.id,
    JSON.stringify(definition),
    JSON.stringify(bot_override.enable),
  ]);
}

function check(type, ok, detail) {
  return { type, ok, detail };
}

// Evalúa los asserts de un turno contra {result, reply, audit}.
function evaluate_turn(expect_block, ctx) {
  const results = [];
  const reply = String(ctx.reply ?? "");
  const intents = Array.isArray(ctx.result?.intents) ? ctx.result.intents : ctx.result?.intent ? [ctx.result.intent] : [];

  if (Array.isArray(expect_block.intents)) {
    const missing = expect_block.intents.filter((wanted) => !intents.includes(wanted));
    results.push(check("intents", missing.length === 0, missing.length ? `faltan intents: ${missing.join(", ")} (got: ${intents.join(", ") || "—"})` : `intents: ${intents.join(", ")}`));
  }
  if (typeof expect_block.reply_contains === "string") {
    const ok = reply.toLowerCase().includes(expect_block.reply_contains.toLowerCase());
    results.push(check("reply_contains", ok, ok ? `ok` : `la respuesta no contiene "${expect_block.reply_contains}" (got: "${reply.slice(0, 120)}")`));
  }
  if (typeof expect_block.reply_matches === "string") {
    let ok = false;
    try {
      ok = new RegExp(expect_block.reply_matches).test(reply);
    } catch {
      ok = false;
    }
    results.push(check("reply_matches", ok, ok ? `ok` : `la respuesta no matchea /${expect_block.reply_matches}/ (got: "${reply.slice(0, 120)}")`));
  }
  if (typeof expect_block.reply_empty === "boolean") {
    const is_empty = !reply.trim();
    results.push(check("reply_empty", is_empty === expect_block.reply_empty, `reply_empty esperado ${expect_block.reply_empty}, fue ${is_empty}`));
  }
  if (typeof expect_block.needs_review === "boolean") {
    const nr = Boolean(ctx.result?.needs_review);
    results.push(check("needs_review", nr === expect_block.needs_review, `needs_review esperado ${expect_block.needs_review}, fue ${nr}`));
  }
  if (typeof expect_block.no_action === "boolean") {
    const none = ctx.audit.length === 0;
    results.push(check("no_action", none === expect_block.no_action, `no_action esperado ${expect_block.no_action}; acciones: ${ctx.audit.map((a) => a.action_id).join(", ") || "ninguna"}`));
  }
  if (Array.isArray(expect_block.actions)) {
    for (const wanted of expect_block.actions) {
      const row = ctx.audit.find((a) => a.action_id === wanted.action_id);
      const ok = Boolean(row) && (!wanted.status || row.status === wanted.status);
      results.push(check("action", ok, ok ? `${wanted.action_id} (${row.status})` : `acción ${wanted.action_id}${wanted.status ? ` status=${wanted.status}` : ""} no encontrada (audit: ${ctx.audit.map((a) => `${a.action_id}:${a.status}`).join(", ") || "ninguna"})`));
    }
  }
  return results;
}

const SAFE_IDENT = /^[a-z_][a-z0-9_]*$/;

// Cuenta filas de una tabla con WHERE opcional. Devuelve {ok,n} o {ok:false,error}.
// El pool está SEMBRADO, así que las aserciones se miden como DELTA (filas que
// ESTA conversación agregó), no como totales absolutos — si no, el seed contamina.
async function count_db(pool, assertion) {
  const table = String(assertion.table ?? "");
  if (!SAFE_IDENT.test(table)) {
    return { ok: false, error: `tabla inválida: ${table}` };
  }
  const where_entries = Object.entries(assertion.where ?? {}).filter(([key]) => SAFE_IDENT.test(key));
  const clauses = where_entries.map(([key], i) => `${key} = $${i + 1}`);
  const sql = `SELECT count(*)::int AS n FROM ${table}${clauses.length ? ` WHERE ${clauses.join(" AND ")}` : ""}`;
  try {
    const n = (await pool.query(sql, where_entries.map(([, value]) => value))).rows[0].n;
    return { ok: true, n };
  } catch (error) {
    return { ok: false, error: `query falló (${table}): ${error.message}` };
  }
}

export async function snapshot_final(pool, expect_final) {
  const baselines = [];
  for (const assertion of Array.isArray(expect_final.db) ? expect_final.db : []) {
    baselines.push(await count_db(pool, assertion));
  }
  return baselines;
}

function db_label(assertion) {
  const where = Object.entries(assertion.where ?? {});
  return `${assertion.table}${where.length ? ` where ${where.map(([k, v]) => `${k}=${v}`).join(", ")}` : ""}`;
}

async function evaluate_final(pool, expect_final, baselines) {
  const results = [];
  const list = Array.isArray(expect_final.db) ? expect_final.db : [];
  for (let i = 0; i < list.length; i += 1) {
    const assertion = list[i];
    const before = baselines?.[i] ?? { ok: false, error: "sin baseline" };
    const after = await count_db(pool, assertion);
    if (!before.ok || !after.ok) {
      results.push(check("db", false, after.error ?? before.error));
      continue;
    }
    const delta = after.n - before.n;
    const label = db_label(assertion);
    if (typeof assertion.count === "number") {
      results.push(check("db", delta === assertion.count, `${label}: +${delta} filas (esperado +${assertion.count})`));
    } else if (typeof assertion.exists === "boolean") {
      const created = delta > 0;
      results.push(check("db", created === assertion.exists, `${label}: +${delta} filas (esperado ${assertion.exists ? "≥1" : "0"})`));
    } else {
      results.push(check("db", delta > 0, `${label}: +${delta} filas`));
    }
  }
  return results;
}

export async function run_conversation(fixture, { pool, provider, memory_store }) {
  const setup = fixture.setup ?? {};
  const channel = setup.channel ?? "whatsapp";
  const channel_def = CHANNELS[channel];
  if (!channel_def) {
    return { name: fixture.name, status: fixture.status ?? "expected_passing", channel, passed: false, error: `canal desconocido: ${channel}`, turns: [], final: [], assert_total: 0, assert_failed: 1 };
  }

  const recipient_id = setup.recipient ?? DEFAULT_RECIPIENT[channel];
  await configure_bot(pool, channel, recipient_id, setup.bot);

  const from = setup.from ?? "5215550000000";
  const client = make_capture_client();
  const deps = { pool, provider, memory_store, [channel_def.deps_key]: client };

  // Baseline de las aserciones de DB ANTES de los turnos: medimos el delta que
  // produjo la conversación (el pool está sembrado).
  const final_baselines = await snapshot_final(pool, fixture.expect_final ?? {});

  const turn_reports = [];
  let index = 0;
  for (const turn of Array.isArray(fixture.turns) ? fixture.turns : []) {
    index += 1;
    const message_id = `eval-${fixture.name}-${index}`;
    let result = null;
    let error = null;
    try {
      const out = await channel_def.handle(channel_def.payload({ from, text: turn.user, message_id, recipient_id }), deps);
      result = Array.isArray(out) ? out[0] ?? null : out;
    } catch (e) {
      error = e;
    }
    const audit = result?.message_id
      ? (await pool.query("SELECT action_id, status FROM action_audit_logs WHERE message_id = $1", [result.message_id])).rows
      : [];
    const reply = result?.reply_text ?? client.sent.at(-1)?.body ?? client.sent.at(-1)?.text ?? "";
    const assertions = error
      ? [check("no_error", false, `el turno lanzó: ${error.message}`)]
      : evaluate_turn(turn.expect ?? {}, { result, reply, audit });
    turn_reports.push({ user: turn.user, reply, assertions });
  }

  const final = await evaluate_final(pool, fixture.expect_final ?? {}, final_baselines);
  const all = [...turn_reports.flatMap((t) => t.assertions), ...final];
  const assert_failed = all.filter((a) => !a.ok).length;
  return {
    name: fixture.name,
    description: fixture.description ?? "",
    status: fixture.status ?? "expected_passing",
    tags: Array.isArray(fixture.tags) ? fixture.tags : [],
    channel,
    turns: turn_reports,
    final,
    assert_total: all.length,
    assert_failed,
    passed: all.length > 0 && assert_failed === 0,
  };
}
