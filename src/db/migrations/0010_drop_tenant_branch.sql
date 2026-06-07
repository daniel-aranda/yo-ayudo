-- Kill "tenant"/"branch" — CONTRACT (final). No code references tenant_id/branch_id
-- or the tenants/branches tables anymore; this physically removes them.
-- Dependent multi-column indexes/constraints are dropped first so plain DROP COLUMN
-- (no CASCADE — pg-mem doesn't support CASCADE) succeeds. A column's own FK to
-- tenants/branches is dropped automatically with the column.

-- Legacy tenant/branch-scoped indexes and constraints.
DROP INDEX IF EXISTS contacts_tenant_phone_unique;
DROP INDEX IF EXISTS contacts_tenant_idx;
DROP INDEX IF EXISTS conversations_contact_channel_unique;
DROP INDEX IF EXISTS conversations_tenant_idx;
DROP INDEX IF EXISTS messages_tenant_created_idx;
DROP INDEX IF EXISTS op_business_days_unique_day;
DROP INDEX IF EXISTS accounts_tenant_unique;
DROP INDEX IF EXISTS agent_profiles_scope_unique;
DROP INDEX IF EXISTS agent_routing_rules_unique;

-- Drop the columns.
ALTER TABLE accounts DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE users DROP COLUMN IF EXISTS branch_id;

ALTER TABLE bot_profiles DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE bot_profiles DROP COLUMN IF EXISTS branch_id;

ALTER TABLE contacts DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE contacts DROP COLUMN IF EXISTS branch_id;

ALTER TABLE conversations DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE conversations DROP COLUMN IF EXISTS branch_id;

ALTER TABLE messages DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE messages DROP COLUMN IF EXISTS branch_id;

ALTER TABLE ai_calls DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE ai_calls DROP COLUMN IF EXISTS branch_id;

ALTER TABLE parsing_results DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE parsing_results DROP COLUMN IF EXISTS branch_id;

ALTER TABLE whatsapp_phone_numbers DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE whatsapp_phone_numbers DROP COLUMN IF EXISTS branch_id;

ALTER TABLE business_settings DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE business_settings DROP COLUMN IF EXISTS branch_id;

ALTER TABLE catalog_items DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE catalog_items DROP COLUMN IF EXISTS branch_id;

ALTER TABLE suppliers DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE suppliers DROP COLUMN IF EXISTS branch_id;

ALTER TABLE inventory_items DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE inventory_items DROP COLUMN IF EXISTS branch_id;

ALTER TABLE op_business_days DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE op_business_days DROP COLUMN IF EXISTS branch_id;

ALTER TABLE op_sales_updates DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE op_sales_updates DROP COLUMN IF EXISTS branch_id;

ALTER TABLE op_purchases DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE op_purchases DROP COLUMN IF EXISTS branch_id;

ALTER TABLE op_inventory_snapshots DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE op_inventory_snapshots DROP COLUMN IF EXISTS branch_id;

ALTER TABLE op_daily_reports DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE op_daily_reports DROP COLUMN IF EXISTS branch_id;

ALTER TABLE review_items DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE review_items DROP COLUMN IF EXISTS branch_id;

ALTER TABLE knowledge_sources DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE knowledge_sources DROP COLUMN IF EXISTS branch_id;

ALTER TABLE memory_documents DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE memory_documents DROP COLUMN IF EXISTS branch_id;

ALTER TABLE agent_profiles DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE agent_routing_rules DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE agent_runs DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE agent_runs DROP COLUMN IF EXISTS branch_id;

ALTER TABLE bots DROP COLUMN IF EXISTS tenant_id;

ALTER TABLE processing_events DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE processing_events DROP COLUMN IF EXISTS branch_id;

DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
