-- Kill "tenant"/"branch" — loosen the remaining legacy NOT NULL constraints so the
-- now-account-based code can stop writing tenant_id/branch_id. Columns are physically
-- dropped in the contract migration (0009).
ALTER TABLE whatsapp_phone_numbers ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE whatsapp_phone_numbers ALTER COLUMN branch_id DROP NOT NULL;
