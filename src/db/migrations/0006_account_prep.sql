-- Kill "tenant"/"branch" — step 2 of 3 (PREP, before the code cutover).
-- Additive + loosening only (stays green): gives accounts a timezone, adds the
-- account-based unique indexes the upserts will switch to, and drops the NOT NULL
-- on legacy tenant_id/branch_id so the code can stop writing them. The columns and
-- the tenants/branches tables are physically dropped in 0007 once no code uses them.

-- accounts gain a timezone (previously lived on tenants/branches/bot_profiles).
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Mexico_City';
UPDATE accounts SET timezone = tenants.timezone
  FROM tenants WHERE tenants.id = accounts.tenant_id AND tenants.timezone IS NOT NULL;

-- Account-based uniqueness to replace the tenant-based upsert keys.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_account_phone_unique ON contacts (account_id, whatsapp_phone);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_account_contact_channel_unique ON conversations (account_id, contact_id, channel);
CREATE UNIQUE INDEX IF NOT EXISTS op_business_days_account_day_unique ON op_business_days (account_id, operation_date);

-- Loosen legacy NOT NULL constraints so code can stop populating tenant_id/branch_id.
ALTER TABLE contacts ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE conversations ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE parsing_results ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE ai_calls ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE review_items ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE agent_runs ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE bots ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE bot_profiles ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE bot_profiles ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE op_business_days ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE op_business_days ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE op_sales_updates ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE op_sales_updates ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE op_purchases ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE op_purchases ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE op_inventory_snapshots ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE op_inventory_snapshots ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE op_daily_reports ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE op_daily_reports ALTER COLUMN branch_id DROP NOT NULL;
