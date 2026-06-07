-- Kill "tenant"/"branch" — step 1 of 2 (EXPAND).
--
-- The operational tables were keyed by tenant_id/branch_id, a legacy mirror of the
-- business/account model (accounts.tenant_id is a 1:1 link). This step adds the
-- canonical account_id/organization_id columns and backfills them from that link.
-- It is purely additive: existing tenant_id/branch_id columns stay until step 2
-- (0006) drops them once all code reads/writes account_id. Nothing breaks here.

-- contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE contacts SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = contacts.tenant_id AND contacts.account_id IS NULL;
CREATE INDEX IF NOT EXISTS contacts_account_idx ON contacts (account_id);

-- conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE conversations SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = conversations.tenant_id AND conversations.account_id IS NULL;
CREATE INDEX IF NOT EXISTS conversations_account_idx ON conversations (account_id);

-- messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE messages SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = messages.tenant_id AND messages.account_id IS NULL;
CREATE INDEX IF NOT EXISTS messages_account_idx ON messages (account_id);

-- parsing_results
ALTER TABLE parsing_results ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE parsing_results ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE parsing_results SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = parsing_results.tenant_id AND parsing_results.account_id IS NULL;

-- ai_calls
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE ai_calls ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE ai_calls SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = ai_calls.tenant_id AND ai_calls.account_id IS NULL;

-- op_business_days
ALTER TABLE op_business_days ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE op_business_days ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE op_business_days SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = op_business_days.tenant_id AND op_business_days.account_id IS NULL;
CREATE INDEX IF NOT EXISTS op_business_days_account_idx ON op_business_days (account_id);

-- op_sales_updates
ALTER TABLE op_sales_updates ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE op_sales_updates ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE op_sales_updates SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = op_sales_updates.tenant_id AND op_sales_updates.account_id IS NULL;
CREATE INDEX IF NOT EXISTS op_sales_updates_account_idx ON op_sales_updates (account_id);

-- op_purchases
ALTER TABLE op_purchases ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE op_purchases ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE op_purchases SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = op_purchases.tenant_id AND op_purchases.account_id IS NULL;
CREATE INDEX IF NOT EXISTS op_purchases_account_idx ON op_purchases (account_id);

-- op_inventory_snapshots
ALTER TABLE op_inventory_snapshots ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE op_inventory_snapshots ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE op_inventory_snapshots SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = op_inventory_snapshots.tenant_id AND op_inventory_snapshots.account_id IS NULL;
CREATE INDEX IF NOT EXISTS op_inventory_snapshots_account_idx ON op_inventory_snapshots (account_id);

-- op_daily_reports
ALTER TABLE op_daily_reports ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE op_daily_reports ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE op_daily_reports SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = op_daily_reports.tenant_id AND op_daily_reports.account_id IS NULL;
CREATE INDEX IF NOT EXISTS op_daily_reports_account_idx ON op_daily_reports (account_id);

-- review_items
ALTER TABLE review_items ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE review_items ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE review_items SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = review_items.tenant_id AND review_items.account_id IS NULL;
CREATE INDEX IF NOT EXISTS review_items_account_idx ON review_items (account_id);

-- agent_runs
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE agent_runs SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = agent_runs.tenant_id AND agent_runs.account_id IS NULL;
CREATE INDEX IF NOT EXISTS agent_runs_account_idx ON agent_runs (account_id);
