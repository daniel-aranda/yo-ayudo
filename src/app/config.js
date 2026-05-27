import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const env_schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .url()
    .default("postgres://yoayudo:yoayudo@localhost:5433/yoayudo"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  WHATSAPP_VERIFY_TOKEN: z.string().default("dev_verify_token"),
  WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default("demo-phone-number-id"),
  AI_PROVIDER: z.enum(["mock", "bedrock"]).default("mock"),
  AWS_REGION: z.string().default("us-east-1"),
  BEDROCK_MODEL_ID: z.string().default(""),
  MEMORY_STORE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  MEMORY_LOCAL_DIR: z.string().default(".storage/memory"),
  MEMORY_S3_BUCKET: z.string().default(""),
  MEMORY_S3_PREFIX: z.string().default("yoayudo/memory"),
  EMBEDDING_PROVIDER: z.enum(["mock", "bedrock"]).default("mock"),
  BEDROCK_EMBEDDING_MODEL_ID: z.string().default(""),
  VECTOR_INDEX_PROVIDER: z.enum(["mock"]).default("mock"),
  VECTOR_INDEX_NAME: z.string().default("yoayudo-dev"),
  AGENT_ROUTER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  MEMORY_INGESTION_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  INSPECTOR_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  INSPECTOR_INTERNAL_TOKEN: z.string().default(""),
  LOG_LEVEL: z.string().default("info"),
});

const parsed_env = env_schema.parse(process.env);

export const config = {
  node_env: parsed_env.NODE_ENV,
  port: parsed_env.PORT,
  database_url: parsed_env.DATABASE_URL,
  app_base_url: parsed_env.APP_BASE_URL,
  whatsapp_verify_token: parsed_env.WHATSAPP_VERIFY_TOKEN,
  whatsapp_access_token: parsed_env.WHATSAPP_ACCESS_TOKEN,
  whatsapp_phone_number_id: parsed_env.WHATSAPP_PHONE_NUMBER_ID,
  ai_provider: parsed_env.AI_PROVIDER,
  aws_region: parsed_env.AWS_REGION,
  bedrock_model_id: parsed_env.BEDROCK_MODEL_ID,
  memory_store_provider: parsed_env.MEMORY_STORE_PROVIDER,
  memory_local_dir: parsed_env.MEMORY_LOCAL_DIR,
  memory_s3_bucket: parsed_env.MEMORY_S3_BUCKET,
  memory_s3_prefix: parsed_env.MEMORY_S3_PREFIX,
  embedding_provider: parsed_env.EMBEDDING_PROVIDER,
  bedrock_embedding_model_id: parsed_env.BEDROCK_EMBEDDING_MODEL_ID,
  vector_index_provider: parsed_env.VECTOR_INDEX_PROVIDER,
  vector_index_name: parsed_env.VECTOR_INDEX_NAME,
  agent_router_enabled: parsed_env.AGENT_ROUTER_ENABLED,
  memory_ingestion_enabled: parsed_env.MEMORY_INGESTION_ENABLED,
  inspector_enabled: parsed_env.INSPECTOR_ENABLED,
  inspector_internal_token: parsed_env.INSPECTOR_INTERNAL_TOKEN,
  log_level: parsed_env.LOG_LEVEL,
};
