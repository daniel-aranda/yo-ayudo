-- System-level interaction settings: the platform-wide layer between the static
-- interaction catalog (code) and per-bot config (bots.definition_json.interactions).
-- Lets an admin globally enable/disable an interaction and configure its provider
-- defaults (e.g. ElevenLabs model/voice for responder_con_voz). `action_id` is
-- denormalized so the action executor can look up enforcement by action without
-- importing the inspector catalog.
CREATE TABLE IF NOT EXISTS interaction_settings (
  type text PRIMARY KEY,
  action_id text,
  enabled boolean NOT NULL DEFAULT true,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interaction_settings_action_idx ON interaction_settings (action_id);
