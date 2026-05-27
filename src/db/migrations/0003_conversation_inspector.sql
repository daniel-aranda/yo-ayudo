CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bot_profile_id uuid REFERENCES bot_profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'active',
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, slug)
);

CREATE INDEX IF NOT EXISTS bots_tenant_idx ON bots (tenant_id);
CREATE INDEX IF NOT EXISTS bots_profile_idx ON bots (bot_profile_id);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id uuid REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE SET NULL;
ALTER TABLE memory_documents ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE SET NULL;
ALTER TABLE review_items ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_bot_idx ON conversations (bot_id);
CREATE INDEX IF NOT EXISTS messages_bot_idx ON messages (bot_id);
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON messages (reply_to_message_id);
CREATE INDEX IF NOT EXISTS agent_runs_bot_idx ON agent_runs (bot_id);
CREATE INDEX IF NOT EXISTS memory_documents_bot_idx ON memory_documents (bot_id);
CREATE INDEX IF NOT EXISTS review_queue_bot_idx ON review_items (bot_id);

CREATE TABLE IF NOT EXISTS processing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_stage text NOT NULL,
  status text NOT NULL DEFAULT 'success',
  title text,
  summary text,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_table text,
  source_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_events_message_idx ON processing_events (message_id, created_at);
CREATE INDEX IF NOT EXISTS processing_events_conversation_idx ON processing_events (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS processing_events_bot_idx ON processing_events (bot_id, created_at);
CREATE INDEX IF NOT EXISTS processing_events_type_idx ON processing_events (event_type, event_stage);
