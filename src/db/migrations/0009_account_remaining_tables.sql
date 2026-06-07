-- Kill "tenant"/"branch" — add account_id/organization_id to the last tables that
-- still only had tenant_id/branch_id (so the seed + any config code can be fully
-- account-based). Additive + backfill; columns dropped in the contract migration (0010).
ALTER TABLE bot_profiles ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE bot_profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE bot_profiles SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = bot_profiles.tenant_id AND bot_profiles.account_id IS NULL;

ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE business_settings ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE business_settings ALTER COLUMN branch_id DROP NOT NULL;
UPDATE business_settings SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = business_settings.tenant_id AND business_settings.account_id IS NULL;

ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE catalog_items ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE catalog_items ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE catalog_items ALTER COLUMN branch_id DROP NOT NULL;
UPDATE catalog_items SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = catalog_items.tenant_id AND catalog_items.account_id IS NULL;

-- inventory_items / suppliers already got account_id in 0007; loosen their NOT NULL too.
ALTER TABLE inventory_items ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE inventory_items ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE suppliers ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE suppliers ALTER COLUMN branch_id DROP NOT NULL;
