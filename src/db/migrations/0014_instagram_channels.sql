-- Instagram as a first-class channel, mirroring the WhatsApp model
-- (whatsapp_phone_numbers + phone_number_bot_assignments). An organization/
-- account owns Instagram business accounts, and each is assigned to one active
-- bot at a time (UNIQUE on active_key), just like phone numbers.

CREATE TABLE IF NOT EXISTS instagram_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,
  username text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_account_id)
);

CREATE INDEX IF NOT EXISTS instagram_accounts_account_idx ON instagram_accounts (account_id);

CREATE TABLE IF NOT EXISTS instagram_account_bot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  instagram_account_id uuid NOT NULL REFERENCES instagram_accounts(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  active_key text DEFAULT 'active',
  assignment_type text NOT NULL DEFAULT 'primary',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id, active_key)
);

CREATE INDEX IF NOT EXISTS instagram_assignments_bot_idx ON instagram_account_bot_assignments (bot_id);
