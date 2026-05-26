import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { config } from "../app/config.js";
import { logger } from "../shared/logger.js";
import { is_entrypoint } from "../shared/entrypoint.js";

export async function run_migrations(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrations_directory = path.join(process.cwd(), "src", "db", "migrations");
  const filenames = (await fs.readdir(migrations_directory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  for (const filename of filenames) {
    const already_applied = await pool.query(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [filename],
    );

    if (already_applied.rowCount) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrations_directory, filename), "utf8");

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await pool.query("COMMIT");
      logger.info({ filename }, "database migration applied");
    } catch (error) {
      await pool.query("ROLLBACK");
      logger.error({ err: error, filename }, "database migration failed");
      throw error;
    }
  }
}

if (is_entrypoint(import.meta.url)) {
  const migration_pool = new pg.Pool({ connectionString: config.database_url });
  run_migrations(migration_pool)
    .then(async () => {
      await migration_pool.end();
      logger.info("database migrations complete");
    })
    .catch(async (error) => {
      await migration_pool.end().catch(() => undefined);
      logger.error({ err: error }, "database migrations failed");
      process.exit(1);
    });
}
