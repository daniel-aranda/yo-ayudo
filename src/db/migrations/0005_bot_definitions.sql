ALTER TABLE bots ADD COLUMN IF NOT EXISTS bot_type text NOT NULL DEFAULT 'system';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS definition_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS definition_version integer NOT NULL DEFAULT 1;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bots_account_type_status_idx ON bots (account_id, bot_type, status);
CREATE INDEX IF NOT EXISTS bots_organization_type_status_idx ON bots (organization_id, bot_type, status);
