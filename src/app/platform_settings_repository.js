import { logger } from "../shared/logger.js";

// Settings globales de plataforma (tabla genérica key/value). Hoy solo guarda el
// default de AI; la fila vive bajo key='ai_provider' con value_json={provider,model}.
const AI_KEY = "ai_provider";

// Default global de AI o null. **Nunca lanza** ante tabla ausente (migración
// parcial / app de test sin la 0020) — el resolver cae a env en ese caso.
export async function get_platform_ai_config(pool) {
  if (!pool) return null;
  try {
    const result = await pool.query("SELECT value_json FROM platform_settings WHERE key = $1 LIMIT 1", [AI_KEY]);
    const value = result.rows[0]?.value_json ?? null;
    return value && typeof value === "object" ? value : null;
  } catch (error) {
    logger.error({ err: error }, "platform ai config read failed");
    return null;
  }
}

export async function upsert_platform_ai_config(pool, { provider, model = "" }) {
  const result = await pool.query(
    `
      INSERT INTO platform_settings (key, value_json, updated_at)
      VALUES ($1, $2::jsonb, now())
      ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
      RETURNING value_json
    `,
    [AI_KEY, JSON.stringify({ provider, model })],
  );
  return result.rows[0]?.value_json ?? null;
}
