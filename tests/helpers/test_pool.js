import path from "node:path";
import { randomUUID as random_uuid } from "node:crypto";
import { readdirSync as read_dir_sync, readFileSync as read_file_sync } from "node:fs";
import { DataType as data_type, newDb as new_db } from "pg-mem";
import { seed_development_data } from "../../src/db/seed.js";

// Building the schema + seed for every test (in before_each) was the dominant
// per-test cost and pushed slow tests past the timeout under parallel load. We
// instead build the migrated (+ optionally seeded) database once per worker,
// snapshot it, and restore that snapshot for each test — restore wipes a prior
// test's writes, so each test still gets an identical clean database, fast.
const snapshots = new Map();

async function build_snapshot(seed) {
  const memory_db = new_db({ autoCreateForeignKeyIndices: true });
  memory_db.public.registerFunction({
    name: "gen_random_uuid",
    returns: data_type.uuid,
    impure: true,
    implementation: random_uuid,
  });

  const adapter = memory_db.adapters.createPg();
  const setup_pool = new adapter.Pool();
  const migrations_directory = path.join(process.cwd(), "src", "db", "migrations");
  const migration_files = read_dir_sync(migrations_directory)
    .filter((filename) => filename.endsWith(".sql"))
    .filter((filename) => filename !== "0003_repair_bot_engine_schema.sql")
    .sort();

  for (const filename of migration_files) {
    const migration_sql = read_file_sync(path.join(migrations_directory, filename), "utf8").replace(
      "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
      "",
    );
    await setup_pool.query(migration_sql);
  }

  if (seed) {
    await seed_development_data(setup_pool);
  }

  await setup_pool.end();
  return { adapter, backup: memory_db.backup() };
}

export async function create_test_pool({ seed = true } = {}) {
  const key = seed ? "seeded" : "bare";
  let snapshot = snapshots.get(key);
  if (snapshot) {
    snapshot.backup.restore();
  } else {
    snapshot = await build_snapshot(seed);
    snapshots.set(key, snapshot);
  }

  return new snapshot.adapter.Pool();
}
