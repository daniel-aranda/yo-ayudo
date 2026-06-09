-- Integration events: operational success/failure of the external services we
-- connect to (WhatsApp Cloud API, S3, ElevenLabs, OpenAI, prospecting providers).
-- Distinct from processing_events (per-message pipeline) and action_audit_logs
-- (per-action). Feeds the admin integrations dashboard's recent +/- counts.
CREATE TABLE IF NOT EXISTS integration_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL,
  latency_ms integer,
  detail text,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_events_key_idx ON integration_events (integration_key, created_at);
CREATE INDEX IF NOT EXISTS integration_events_status_idx ON integration_events (status, created_at);
CREATE INDEX IF NOT EXISTS integration_events_created_idx ON integration_events (created_at);
