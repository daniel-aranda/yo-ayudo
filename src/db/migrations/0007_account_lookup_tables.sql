-- Kill "tenant"/"branch" — account_id on the operational lookup tables the
-- handlers read (inventory_items, suppliers). Additive + backfill; tenant_id/branch_id
-- are dropped later in the contract migration.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE inventory_items SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = inventory_items.tenant_id AND inventory_items.account_id IS NULL;
CREATE INDEX IF NOT EXISTS inventory_items_account_idx ON inventory_items (account_id);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
UPDATE suppliers SET account_id = accounts.id, organization_id = accounts.organization_id
  FROM accounts WHERE accounts.tenant_id = suppliers.tenant_id AND suppliers.account_id IS NULL;
CREATE INDEX IF NOT EXISTS suppliers_account_idx ON suppliers (account_id);
