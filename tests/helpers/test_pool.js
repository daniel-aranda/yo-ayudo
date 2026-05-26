import path from "node:path";
import { randomUUID as random_uuid } from "node:crypto";
import { readdirSync as read_dir_sync, readFileSync as read_file_sync } from "node:fs";
import { DataType as data_type, newDb as new_db } from "pg-mem";
import { seed_development_data } from "../../src/db/seed.js";

export async function create_test_pool({ seed = true } = {}) {
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

  if (seed) {
    await seed_development_data(pool);
  }

  return pool;
}
