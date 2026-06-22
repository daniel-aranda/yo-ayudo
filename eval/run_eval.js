import { mkdirSync as mkdir_sync, readdirSync as read_dir_sync, readFileSync as read_file_sync, writeFileSync as write_file_sync } from "node:fs";
import path from "node:path";
import { config } from "../src/app/config.js";
import { create_model_provider } from "../src/ai/provider_factory.js";
import { local_memory_store } from "../src/memory/local_memory_store.js";
import { create_test_pool } from "../tests/helpers/test_pool.js";
import { run_conversation } from "./eval_runner.js";

// CLI del harness de evaluación. Corre el corpus de conversaciones contra el
// proveedor de IA REAL configurado y reporta el % que pasa (dashboard de avance).
// NO es un gate de CI: siempre sale 0. La métrica de mejora vive en el reporte.

function parse_args(argv) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) flags[match[1]] = match[2];
    else if (arg.startsWith("--")) flags[arg.slice(2)] = true;
    else positional.push(arg);
  }
  return { flags, positional };
}

function model_for(provider_name) {
  return (
    {
      openai: config.openai_model,
      gemini: config.gemini_model,
      claude: config.anthropic_model,
      bedrock: config.bedrock_model_id,
      mock: "mock-local",
    }[provider_name] ?? ""
  );
}

function key_for(provider_name) {
  return { openai: config.openai_api_key, gemini: config.gemini_api_key, claude: config.anthropic_api_key }[provider_name] ?? "";
}

const COLORS = { green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", dim: "\x1b[2m", bold: "\x1b[1m", reset: "\x1b[0m" };
const paint = (color, text) => `${COLORS[color]}${text}${COLORS.reset}`;

function escape_html(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function build_html({ reports, summary, provider_label, generated_at }) {
  const rate = summary.total ? Math.round((summary.passed / summary.total) * 100) : 0;
  const rows = reports
    .map((report) => {
      const failed = [...report.turns.flatMap((t) => t.assertions), ...report.final].filter((a) => !a.ok);
      const detail = report.error
        ? escape_html(report.error)
        : failed.map((f) => `<div class="fail">✗ ${escape_html(f.detail)}</div>`).join("") || '<span class="ok">todo verde</span>';
      return `<tr class="${report.passed ? "row-pass" : "row-fail"}">
        <td><strong>${escape_html(report.name)}</strong><div class="desc">${escape_html(report.description || "")}</div></td>
        <td><span class="badge badge--${report.status}">${report.status === "expected_passing" ? "esperada" : "baseline"}</span></td>
        <td>${escape_html(report.channel)}</td>
        <td class="result">${report.passed ? '<span class="ok">✓ pasa</span>' : '<span class="no">✗ falla</span>'} <span class="dim">${report.assert_total - report.assert_failed}/${report.assert_total}</span></td>
        <td>${detail}</td>
      </tr>`;
    })
    .join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YoAyudo · Eval de conversaciones</title>
<style>
:root{--bg:#f6f4ee;--surface:#fff;--surface-strong:#f0ede4;--text:#1a1a16;--muted:#6c6f64;--line:#e7e2d6;--accent:#0f6a5a;--accent-dark:#0a4a3f;--accent-soft:#e4f1ea;--clay-bg:#ecdcdc;--clay-ink:#8c4a42;--amber-bg:#f6e7c6;--amber-ink:#8a6116;}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;padding:32px}
.wrap{max-width:1100px;margin:0 auto}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px;font-size:13px}
.cards{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 22px;box-shadow:0 1px 3px rgba(26,26,18,.06)}
.card .n{font-size:34px;font-weight:800;line-height:1}.card .l{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-top:6px}
.rate{background:var(--accent);color:#fff;border-color:var(--accent)}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
th,td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top;font-size:13px}
th{background:var(--surface-strong);font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.desc{color:var(--muted);font-size:12px;margin-top:2px}
.badge{font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px}
.badge--expected_passing{background:var(--accent-soft);color:var(--accent-dark)}.badge--baseline_failing{background:var(--amber-bg);color:var(--amber-ink)}
.ok{color:var(--accent-dark);font-weight:600}.no{color:var(--clay-ink);font-weight:700}.dim{color:var(--muted)}
.fail{color:var(--clay-ink);font-size:12px;margin:2px 0}
.row-fail{background:rgba(140,74,66,.04)}
.result{white-space:nowrap}
</style></head><body><div class="wrap">
<h1>Eval de conversaciones</h1>
<p class="sub">Proveedor: <strong>${escape_html(provider_label)}</strong> · ${escape_html(generated_at)} · ${summary.total} conversaciones</p>
<div class="cards">
  <div class="card rate"><div class="n">${rate}%</div><div class="l">pasan</div></div>
  <div class="card"><div class="n">${summary.expected.passed}/${summary.expected.total}</div><div class="l">esperadas verdes</div></div>
  <div class="card"><div class="n">${summary.baseline.passed}/${summary.baseline.total}</div><div class="l">baseline ya pasando</div></div>
</div>
<table><thead><tr><th>Conversación</th><th>Tipo</th><th>Canal</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>${rows}</tbody></table>
</div></body></html>`;
}

async function main() {
  const { flags, positional } = parse_args(process.argv.slice(2));
  const dir = positional[0] ?? path.join("eval", "conversations");
  const provider_name = flags.provider ?? config.ai_provider;
  const model = flags.model ?? model_for(provider_name);
  const degraded = provider_name !== "mock" && provider_name !== "bedrock" && !key_for(provider_name);
  const provider_label = degraded ? `${provider_name} → mock (sin API key)` : `${provider_name} ${model}`.trim();

  if (degraded) {
    console.log(paint("yellow", `⚠  ${provider_name} sin API key: corriendo contra el mock determinístico. Configura la key para una eval REAL.`));
  }

  const files = read_dir_sync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  let fixtures = files.map((f) => ({ file: f, ...JSON.parse(read_file_sync(path.join(dir, f), "utf8")) }));
  if (flags.tag) fixtures = fixtures.filter((fx) => Array.isArray(fx.tags) && fx.tags.includes(flags.tag));
  if (flags.name) fixtures = fixtures.filter((fx) => String(fx.name).includes(flags.name));

  if (!fixtures.length) {
    console.log(paint("yellow", `No hay fixtures en ${dir}.`));
    return;
  }

  console.log(`\n${paint("bold", "YoAyudo · Eval de conversaciones")}  ${paint("dim", `(${provider_label})`)}\n`);

  const reports = [];
  for (const fixture of fixtures) {
    const pool = await create_test_pool();
    const memory_store = new local_memory_store({ base_dir: ".storage/eval-memory" });
    let report;
    try {
      const base_provider = create_model_provider({ provider: provider_name, model });
      report = await run_conversation(fixture, { pool, provider: base_provider, memory_store });
    } catch (error) {
      report = { name: fixture.name, status: fixture.status ?? "expected_passing", channel: fixture.setup?.channel ?? "?", description: fixture.description ?? "", tags: [], turns: [], final: [], passed: false, error: error.message, assert_total: 0, assert_failed: 1 };
    } finally {
      await pool.end();
    }
    reports.push(report);
    const mark = report.passed ? paint("green", "✓") : paint("red", "✗");
    const tag = report.status === "baseline_failing" ? paint("yellow", "[baseline]") : paint("dim", "[esperada]");
    console.log(`  ${mark} ${report.name.padEnd(36)} ${tag}  ${paint("dim", `${report.assert_total - report.assert_failed}/${report.assert_total}`)}`);
    if (!report.passed) {
      const failed = [...report.turns.flatMap((t) => t.assertions), ...report.final].filter((a) => !a.ok);
      if (report.error) console.log(`      ${paint("red", report.error)}`);
      for (const f of failed) console.log(`      ${paint("dim", "·")} ${f.detail}`);
    }
  }

  const tally = (list) => ({ total: list.length, passed: list.filter((r) => r.passed).length });
  const summary = {
    ...tally(reports),
    expected: tally(reports.filter((r) => r.status === "expected_passing")),
    baseline: tally(reports.filter((r) => r.status === "baseline_failing")),
  };
  const rate = summary.total ? Math.round((summary.passed / summary.total) * 100) : 0;

  console.log(`\n${paint("bold", "Resumen")}`);
  console.log(`  ${paint(rate >= 80 ? "green" : "yellow", `${rate}% pasan`)} (${summary.passed}/${summary.total})`);
  console.log(`  Esperadas (regresión): ${summary.expected.passed}/${summary.expected.total}`);
  console.log(`  Baseline ya pasando:   ${summary.baseline.passed}/${summary.baseline.total}  ${paint("dim", "(sube este número al mejorar)")}`);

  const promote = reports.filter((r) => r.status === "baseline_failing" && r.passed);
  if (promote.length) {
    console.log(`\n${paint("green", "↑ Promover a 'expected_passing' (ya pasan):")} ${promote.map((r) => r.name).join(", ")}`);
  }

  const results_dir = path.join("eval", "results");
  mkdir_sync(results_dir, { recursive: true });
  const generated_at = new Date().toISOString();
  const payload = { generated_at, provider: provider_label, summary, reports };
  write_file_sync(path.join(results_dir, "latest.json"), JSON.stringify(payload, null, 2));
  write_file_sync(path.join(results_dir, `run-${generated_at.replace(/[:.]/g, "-")}.json`), JSON.stringify(payload, null, 2));
  write_file_sync(path.join(results_dir, "report.html"), build_html({ reports, summary, provider_label, generated_at }));
  console.log(`\n${paint("dim", `Reporte: eval/results/report.html  ·  histórico: eval/results/latest.json`)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
