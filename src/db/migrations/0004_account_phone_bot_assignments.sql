ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_unique ON accounts (tenant_id);
CREATE INDEX IF NOT EXISTS accounts_organization_idx ON accounts (organization_id);

ALTER TABLE whatsapp_phone_numbers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_phone_numbers ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_phone_numbers_account_idx ON whatsapp_phone_numbers (account_id);
CREATE INDEX IF NOT EXISTS whatsapp_phone_numbers_organization_idx ON whatsapp_phone_numbers (organization_id);

CREATE TABLE IF NOT EXISTS phone_number_bot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  whatsapp_phone_number_id uuid NOT NULL REFERENCES whatsapp_phone_numbers(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  active_key text DEFAULT 'active',
  assignment_type text NOT NULL DEFAULT 'primary',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (whatsapp_phone_number_id, active_key)
);

CREATE INDEX IF NOT EXISTS phone_number_bot_assignments_phone_idx
  ON phone_number_bot_assignments (whatsapp_phone_number_id);

CREATE INDEX IF NOT EXISTS phone_number_bot_assignments_bot_idx
  ON phone_number_bot_assignments (bot_id);

CREATE INDEX IF NOT EXISTS phone_number_bot_assignments_account_idx
  ON phone_number_bot_assignments (account_id);
