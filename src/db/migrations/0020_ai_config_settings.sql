-- AI provider configurable por scope (global → cuenta → bot).
-- · cuenta: nueva columna settings_json (espejo de bots.settings_json) para
--   guardar settings_json.ai = {provider, model}.
-- · global: tabla genérica key/value para el default de la plataforma
--   (key='ai_provider', value_json={provider, model}); reutilizable a futuro.
-- La resolución bot > cuenta > global > env vive en src/ai/ai_config_resolver.js.
-- DDL deliberadamente dentro del vocabulario de 0013 (compatible pg-mem).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS settings_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
