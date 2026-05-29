import path from "node:path";
import { randomUUID as random_uuid } from "node:crypto";
import { readdirSync as read_dir_sync, readFileSync as read_file_sync } from "node:fs";
import { DataType as data_type, newDb as new_db } from "pg-mem";
import { seed_development_data } from "../src/db/seed.js";
import { list_action_audit_logs } from "../src/actions/action_audit_repository.js";
import { list_bot_guardrail_events } from "../src/bot_engine/bot_guardrail_event_repository.js";
import { bot_engine_test_service } from "../src/bot_engine/bot_engine_test_service.js";

async function create_memory_pool() {
  const memory_db = new_db({ autoCreateForeignKeyIndices: true });
  memory_db.public.registerFunction({
    name: "gen_random_uuid",
    returns: data_type.uuid,
    impure: true,
    implementation: random_uuid,
  });

  const adapter = memory_db.adapters.createPg();
  const pool = new adapter.Pool();
  const migrations_directory = path.join(process.cwd(), "src", "db", "migrations");
  const migration_files = read_dir_sync(migrations_directory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of migration_files) {
    const migration_sql = read_file_sync(path.join(migrations_directory, filename), "utf8")
      .replace("CREATE EXTENSION IF NOT EXISTS pgcrypto;", "");
    await pool.query(migration_sql);
  }

  await seed_development_data(pool);
  return pool;
}

function print_section(title, value) {
  console.log(`\n## ${title}`);
  console.log(JSON.stringify(value, null, 2));
}

const pool = await create_memory_pool();

try {
  const account_result = await pool.query("SELECT * FROM accounts WHERE slug = 'demo-account' LIMIT 1");
  const bot_result = await pool.query("SELECT * FROM bots WHERE slug = 'operador_comercial_yoayudo' LIMIT 1");
  const account = account_result.rows[0];
  const bot = bot_result.rows[0];
  const tester = new bot_engine_test_service({ pool });
  const result = await tester.test_message({
    organization_id: account.organization_id,
    account_id: account.id,
    bot_id: bot.id,
    modo_test: true,
    mensaje:
      "Registra que hablé con Taller El Rayo. Están interesados en un bot que dé seguimiento a cotizaciones. Crea tarea para llamar mañana.",
  });
  const gap_result = await tester.test_message({
    organization_id: account.organization_id,
    account_id: account.id,
    bot_id: bot.id,
    modo_test: true,
    mensaje: "También manda un email y programa una llamada automática.",
  });
  const audit_logs = await list_action_audit_logs(pool, { account_id: account.id, bot_id: bot.id, limit: 20 });
  const guardrail_events = await list_bot_guardrail_events(pool, { account_id: account.id, bot_id: bot.id, limit: 20 });

  print_section("Bot", { id: bot.id, slug: bot.slug, name: bot.name });
  print_section("Respuesta", result.respuesta);
  print_section("Respuesta con capability gaps", gap_result.respuesta);
  print_section("Action requests", result.action_requests);
  print_section("Actions ejecutadas", result.actions_ejecutadas.map((action) => ({
    action_id: action.action_id,
    status: action.status,
    output: action.output,
  })));
  print_section("Audit logs", audit_logs.map((log) => ({
    action_id: log.action_id,
    status: log.status,
    output_json: log.output_json,
  })));
  print_section("Guardrail events", guardrail_events.map((event) => ({
    tipo: event.tipo,
    action_id: event.action_id,
    descripcion: event.descripcion,
  })));
} finally {
  await pool.end();
}
