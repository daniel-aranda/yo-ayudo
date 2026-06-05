import { execFileSync as exec_file_sync } from "node:child_process";
import pg from "pg";
import { z } from "zod";
import { config } from "./config.js";
import { ensure_local_docker_runtime } from "./local_docker.js";
import { run_migrations } from "../db/migrate.js";

const local_docker_database_url = "postgres://yoayudo:yoayudo@localhost:5433/yoayudo";

const doctor_env_schema = z.object({
  node_env: z.enum(["development", "test", "production"]),
  port: z.number().int().positive(),
  database_url: z.string().url(),
  app_base_url: z.string().url(),
  ai_provider: z.enum(["mock", "bedrock", "openai"]),
  memory_store_provider: z.enum(["local", "s3"]),
  embedding_provider: z.enum(["mock", "bedrock"]),
  vector_index_provider: z.enum(["mock"]),
  agent_router_enabled: z.boolean(),
  memory_ingestion_enabled: z.boolean(),
  inspector_enabled: z.boolean(),
  inspector_internal_token: z.string(),
  whatsapp_verify_token: z.string().min(1),
  whatsapp_phone_number_id: z.string().min(1),
});

function log(message) {
  process.stdout.write(`[dev-doctor] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[dev-doctor] ${message}\n`);
  process.exit(1);
}

function check_node_version() {
  const major_version = Number(process.versions.node.split(".")[0]);

  if (!Number.isFinite(major_version) || major_version < 20) {
    fail(`Node.js >=20 is required. Current version: ${process.version}`);
  }

  log(`Node.js ${process.version} ok`);
}

function check_environment() {
  const result = doctor_env_schema.safeParse(config);

  if (!result.success) {
    fail(`Invalid environment: ${result.error.message}`);
  }

  if (config.node_env === "development" && config.ai_provider === "bedrock") {
    fail("AI_PROVIDER=bedrock is a stub in this MVP. Use AI_PROVIDER=mock for local dev.");
  }

  if (config.ai_provider === "openai" && !config.openai_api_key) {
    fail("OPENAI_API_KEY is required when AI_PROVIDER=openai. Set it in .env before using Probar bot with real AI.");
  }

  if (config.node_env === "development" && config.embedding_provider === "bedrock") {
    fail("EMBEDDING_PROVIDER=bedrock is a stub in this MVP. Use EMBEDDING_PROVIDER=mock for local dev.");
  }

  if (config.memory_store_provider === "s3" && !config.memory_s3_bucket) {
    fail("MEMORY_S3_BUCKET is required when MEMORY_STORE_PROVIDER=s3.");
  }

  if (!config.whatsapp_access_token) {
    log("WHATSAPP_ACCESS_TOKEN is empty; outbound WhatsApp sends will be logged as skipped");
  }

  log(`Environment ok for ${config.node_env}`);
}

async function can_connect_to_database() {
  const client = new pg.Client({ connectionString: config.database_url });

  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

function is_local_docker_database() {
  return config.database_url === local_docker_database_url;
}

function ensure_docker_database_is_up() {
  if (!is_local_docker_database()) {
    fail(
      "Cannot connect to DATABASE_URL and it is not the default Docker database. Start your database manually or update DATABASE_URL.",
    );
  }

  try {
    ensure_local_docker_runtime({ log });
    exec_file_sync("docker", ["compose", "up", "-d", "postgres"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
  } catch (error) {
    fail(
      error instanceof Error
        ? `Failed to run docker compose: ${error.message}`
        : "Failed to run docker compose. Docker or Colima could not be repaired automatically.",
    );
  }
}

async function wait_for_database() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (await can_connect_to_database()) {
      log("PostgreSQL connection ok");
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  fail("PostgreSQL did not become available within 60 seconds.");
}

async function ensure_database() {
  if (await can_connect_to_database()) {
    log("PostgreSQL already reachable");
  } else {
    log("PostgreSQL is not reachable; attempting docker compose up");
    ensure_docker_database_is_up();
    await wait_for_database();
  }

  const pool = new pg.Pool({ connectionString: config.database_url });

  try {
    await run_migrations(pool);
    log("Database migrations ok");

    const tenant_count = await pool.query("SELECT COUNT(*) AS count FROM tenants");

    if (Number(tenant_count.rows[0]?.count ?? 0) === 0) {
      log("No tenants found. Run npm run db:seed if you want demo data.");
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  if (config.node_env !== "development") {
    log(`Skipping dev checks for NODE_ENV=${config.node_env}`);
    return;
  }

  check_node_version();
  check_environment();
  await ensure_database();
  log("Sandbox doctor passed");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Unknown dev doctor failure");
});
