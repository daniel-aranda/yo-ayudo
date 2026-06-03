-- ============================================================
-- Squashed from 0001_initial.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS solution_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  default_intents_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_fields_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_reports_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_messages_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS solution_templates_key_unique ON solution_templates (key);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_unique ON tenants (slug);

CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS branches_tenant_idx ON branches (tenant_id);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'owner',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

CREATE TABLE IF NOT EXISTS bot_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  name text NOT NULL,
  solution_template_id uuid NOT NULL REFERENCES solution_templates(id) ON DELETE RESTRICT,
  language text NOT NULL DEFAULT 'es-MX',
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_profiles_tenant_idx ON bot_profiles (tenant_id);
CREATE INDEX IF NOT EXISTS bot_profiles_branch_idx ON bot_profiles (branch_id);

CREATE TABLE IF NOT EXISTS bot_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_profile_id uuid NOT NULL REFERENCES bot_profiles(id) ON DELETE CASCADE,
  intent_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  extraction_schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  examples_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  response_templates_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bot_intents_profile_key_unique ON bot_intents (bot_profile_id, intent_key);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  whatsapp_phone text NOT NULL,
  display_name text,
  role_label text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_tenant_phone_unique ON contacts (tenant_id, whatsapp_phone);
CREATE INDEX IF NOT EXISTS contacts_tenant_idx ON contacts (tenant_id);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz,
  human_handoff_status text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_contact_channel_unique ON conversations (tenant_id, contact_id, channel);
CREATE INDEX IF NOT EXISTS conversations_tenant_idx ON conversations (tenant_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  direction text NOT NULL,
  external_message_id text,
  message_type text NOT NULL DEFAULT 'text',
  raw_payload_json jsonb NOT NULL,
  text_body text,
  media_url text,
  media_mime_type text,
  parsed_intent text,
  parsed_json jsonb,
  confidence numeric(5,4),
  needs_review boolean NOT NULL DEFAULT false,
  processing_status text NOT NULL DEFAULT 'stored',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_tenant_created_idx ON messages (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages (conversation_id);
CREATE INDEX IF NOT EXISTS messages_external_id_idx ON messages (external_message_id);

CREATE TABLE IF NOT EXISTS ai_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  function_name text NOT NULL,
  input_json jsonb NOT NULL,
  output_json jsonb,
  prompt_tokens numeric(12,0),
  completion_tokens numeric(12,0),
  estimated_cost numeric(12,6),
  latency_ms numeric(12,0),
  status text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_calls_message_idx ON ai_calls (message_id);

CREATE TABLE IF NOT EXISTS parsing_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  parser_name text NOT NULL,
  intent text NOT NULL,
  extracted_json jsonb NOT NULL,
  confidence numeric(5,4) NOT NULL,
  needs_review boolean NOT NULL DEFAULT false,
  validation_errors_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS parsing_results_message_idx ON parsing_results (message_id);

CREATE TABLE IF NOT EXISTS whatsapp_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  phone_number_id text NOT NULL,
  display_phone_number text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_phone_numbers_unique ON whatsapp_phone_numbers (phone_number_id);

CREATE TABLE IF NOT EXISTS business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  opening_days_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  opening_hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  strong_days_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  weak_days_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  monthly_rent numeric(12,2) DEFAULT 0,
  average_electricity numeric(12,2) DEFAULT 0,
  average_water numeric(12,2) DEFAULT 0,
  average_gas numeric(12,2) DEFAULT 0,
  other_fixed_costs_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL,
  price numeric(12,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_unit text NOT NULL,
  category text NOT NULL,
  approximate_unit_cost numeric(12,2),
  yield_notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS op_business_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  operation_date date NOT NULL,
  status text NOT NULL DEFAULT 'open',
  opening_cash numeric(12,2),
  closing_cash numeric(12,2),
  total_sales numeric(12,2),
  cash_sales numeric(12,2),
  card_sales numeric(12,2),
  transfer_sales numeric(12,2),
  delivery_app_sales numeric(12,2),
  cash_withdrawals numeric(12,2),
  cash_payments numeric(12,2),
  comps_amount numeric(12,2),
  internal_consumption_amount numeric(12,2),
  credit_sales_amount numeric(12,2),
  cancellations_amount numeric(12,2),
  waste_notes text,
  shortage_notes text,
  surplus_notes text,
  free_comment text,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS op_business_days_unique_day ON op_business_days (tenant_id, branch_id, operation_date);
CREATE INDEX IF NOT EXISTS op_business_days_branch_date_idx ON op_business_days (tenant_id, branch_id, operation_date);

CREATE TABLE IF NOT EXISTS op_sales_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_day_id uuid NOT NULL REFERENCES op_business_days(id) ON DELETE CASCADE,
  reported_at timestamptz NOT NULL DEFAULT now(),
  accumulated_sales numeric(12,2) NOT NULL,
  cash_sales numeric(12,2),
  card_sales numeric(12,2),
  transfer_sales numeric(12,2),
  delivery_app_sales numeric(12,2),
  note text,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS op_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_day_id uuid NOT NULL REFERENCES op_business_days(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  quantity numeric(12,3) NOT NULL,
  unit text NOT NULL,
  total_cost numeric(12,2) NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name_raw text,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS op_inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_day_id uuid NOT NULL REFERENCES op_business_days(id) ON DELETE CASCADE,
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('opening', 'closing')),
  item_name text NOT NULL,
  inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
  quantity numeric(12,3) NOT NULL,
  unit text NOT NULL,
  source_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS op_daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  business_day_id uuid NOT NULL REFERENCES op_business_days(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  summary_text text NOT NULL,
  metrics_json jsonb NOT NULL,
  alerts_json jsonb NOT NULL,
  recommendations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  raw_text text,
  extracted_json jsonb,
  resolution_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_queue_status_idx ON review_items (status);
CREATE INDEX IF NOT EXISTS review_queue_tenant_idx ON review_items (tenant_id);

-- ============================================================
-- Squashed from 0002_memory_agents.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  solution_template_id uuid REFERENCES solution_templates(id) ON DELETE CASCADE,
  bot_profile_id uuid REFERENCES bot_profiles(id) ON DELETE CASCADE,
  scope text NOT NULL,
  source_type text NOT NULL,
  name text NOT NULL,
  description text,
  summary text,
  quick_facts jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_status text NOT NULL DEFAULT 'draft',
  last_summarized_at timestamptz,
  origin text,
  status text NOT NULL DEFAULT 'active',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memory_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  business_day_id uuid REFERENCES op_business_days(id) ON DELETE SET NULL,
  solution_template_id uuid REFERENCES solution_templates(id) ON DELETE SET NULL,
  bot_profile_id uuid REFERENCES bot_profiles(id) ON DELETE SET NULL,
  scope text NOT NULL,
  document_type text NOT NULL,
  title text,
  content text NOT NULL,
  content_hash text NOT NULL,
  source_table text,
  source_id uuid,
  source_created_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'private',
  status text NOT NULL DEFAULT 'pending',
  s3_bucket text,
  s3_key text,
  local_path text,
  embedding_status text NOT NULL DEFAULT 'pending',
  embedding_provider text,
  embedding_model text,
  embedding_vector_id text,
  embedding_index_name text,
  embedding_error text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, document_type, version)
);

CREATE INDEX IF NOT EXISTS memory_documents_tenant_created_idx ON memory_documents (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS memory_documents_scope_type_idx ON memory_documents (scope, document_type);
CREATE INDEX IF NOT EXISTS memory_documents_embedding_status_idx ON memory_documents (embedding_status);
CREATE INDEX IF NOT EXISTS memory_documents_content_hash_idx ON memory_documents (content_hash);
CREATE INDEX IF NOT EXISTS memory_documents_message_idx ON memory_documents (message_id);
CREATE INDEX IF NOT EXISTS memory_documents_conversation_idx ON memory_documents (conversation_id);
CREATE INDEX IF NOT EXISTS memory_documents_business_day_idx ON memory_documents (business_day_id);
CREATE INDEX IF NOT EXISTS memory_documents_source_idx ON memory_documents (source_table, source_id);

CREATE TABLE IF NOT EXISTS agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  agent_type text NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  solution_template_id uuid REFERENCES solution_templates(id) ON DELETE CASCADE,
  bot_profile_id uuid REFERENCES bot_profiles(id) ON DELETE CASCADE,
  system_instructions text,
  allowed_intents_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_tools_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  retrieval_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, tenant_id, solution_template_id, bot_profile_id)
);

CREATE TABLE IF NOT EXISTS agent_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  solution_template_id uuid REFERENCES solution_templates(id) ON DELETE CASCADE,
  bot_profile_id uuid REFERENCES bot_profiles(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 100,
  intent_key text,
  agent_profile_id uuid REFERENCES agent_profiles(id) ON DELETE CASCADE,
  condition_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_routing_rules_lookup_idx
  ON agent_routing_rules (enabled, intent_key, priority);

CREATE TABLE IF NOT EXISTS agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES branches(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  agent_profile_id uuid REFERENCES agent_profiles(id) ON DELETE SET NULL,
  agent_key text NOT NULL,
  run_type text NOT NULL,
  input_json jsonb NOT NULL,
  retrieved_context_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_json jsonb,
  status text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS agent_runs_message_idx ON agent_runs (message_id);
CREATE INDEX IF NOT EXISTS agent_runs_tenant_created_idx ON agent_runs (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS agent_runs_agent_key_idx ON agent_runs (agent_key);

-- ============================================================
-- Squashed from 0003_conversation_inspector.sql
-- ============================================================
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

-- ============================================================
-- Squashed from 0004_account_phone_bot_assignments.sql
-- ============================================================
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

-- ============================================================
-- Squashed from 0005_bot_definitions.sql
-- ============================================================
ALTER TABLE bots ADD COLUMN IF NOT EXISTS bot_type text NOT NULL DEFAULT 'system';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS definition_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS definition_version integer NOT NULL DEFAULT 1;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bots_account_type_status_idx ON bots (account_id, bot_type, status);
CREATE INDEX IF NOT EXISTS bots_organization_type_status_idx ON bots (organization_id, bot_type, status);

-- ============================================================
-- Squashed from 0006_memory_knowledge_families.sql
-- ============================================================
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS source_family text NOT NULL DEFAULT 'business_knowledge';

ALTER TABLE memory_documents ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE memory_documents ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE memory_documents ADD COLUMN IF NOT EXISTS document_family text NOT NULL DEFAULT 'legacy';

UPDATE memory_documents
SET document_family = CASE
  WHEN document_type IN ('global_knowledge', 'solution_knowledge') THEN 'system_knowledge'
  WHEN document_type IN ('client_knowledge') THEN 'business_knowledge'
  WHEN document_type IN ('message', 'conversation_summary', 'router_decision', 'agent_observation') THEN 'conversation_memory'
  ELSE document_family
END
WHERE document_family = 'legacy';

CREATE INDEX IF NOT EXISTS knowledge_sources_organization_idx ON knowledge_sources (organization_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_account_idx ON knowledge_sources (account_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_bot_idx ON knowledge_sources (bot_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_family_scope_idx ON knowledge_sources (source_family, scope);

CREATE INDEX IF NOT EXISTS memory_documents_organization_idx ON memory_documents (organization_id);
CREATE INDEX IF NOT EXISTS memory_documents_account_idx ON memory_documents (account_id);
CREATE INDEX IF NOT EXISTS memory_documents_family_scope_type_idx
  ON memory_documents (document_family, scope, document_type);

-- ============================================================
-- Squashed from 0007_agent_routing_decisions.sql
-- ============================================================
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_id text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_name text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_type text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_reason text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_confidence numeric(5, 4);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_candidates_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS used_context_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS handoff_recommended boolean NOT NULL DEFAULT false;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS handoff_reason text;

CREATE INDEX IF NOT EXISTS agent_runs_selected_agent_idx ON agent_runs (selected_agent_id);
CREATE INDEX IF NOT EXISTS agent_runs_handoff_idx ON agent_runs (handoff_recommended, created_at);

-- ============================================================
-- Squashed from 0008_commercial_agent_platform.sql
-- ============================================================
ALTER TABLE bots ADD COLUMN IF NOT EXISTS paquete_id text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS enabled_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS reglas_escalamiento_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS campos_requeridos_json jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS bots_paquete_idx ON bots (paquete_id);

CREATE TABLE IF NOT EXISTS diagnosticos_ai (
  diagnostico_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  prospecto_id uuid,
  negocio_nombre text NOT NULL,
  giro text,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  vendedor_id text,
  precio_diagnostico numeric(12, 2) NOT NULL DEFAULT 400,
  moneda text NOT NULL DEFAULT 'MXN',
  pagado boolean NOT NULL DEFAULT false,
  acreditable boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'nuevo',
  respuestas_entrevista jsonb NOT NULL DEFAULT '{}'::jsonb,
  problemas_detectados jsonb NOT NULL DEFAULT '[]'::jsonb,
  oportunidades_ai jsonb NOT NULL DEFAULT '[]'::jsonb,
  paquete_recomendado text,
  acciones_recomendadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  precio_mensual_sugerido numeric(12, 2),
  propuesta_resumen jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS diagnosticos_ai_organization_idx ON diagnosticos_ai (organization_id, created_at);
CREATE INDEX IF NOT EXISTS diagnosticos_ai_account_idx ON diagnosticos_ai (account_id, created_at);
CREATE INDEX IF NOT EXISTS diagnosticos_ai_vendedor_idx ON diagnosticos_ai (vendedor_id, created_at);
CREATE INDEX IF NOT EXISTS diagnosticos_ai_status_idx ON diagnosticos_ai (status, created_at);

CREATE TABLE IF NOT EXISTS action_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  action_id text NOT NULL,
  status text NOT NULL,
  input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text,
  confirmation_required boolean NOT NULL DEFAULT false,
  confirmed_by text,
  confirmed_at timestamptz,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_audit_logs_action_idx ON action_audit_logs (action_id, created_at);
CREATE INDEX IF NOT EXISTS action_audit_logs_account_idx ON action_audit_logs (account_id, created_at);
CREATE INDEX IF NOT EXISTS action_audit_logs_bot_idx ON action_audit_logs (bot_id, created_at);
CREATE INDEX IF NOT EXISTS action_audit_logs_status_idx ON action_audit_logs (status, created_at);

-- ============================================================
-- Squashed from 0009_bot_engine_config.sql
-- ============================================================
ALTER TABLE bots ADD COLUMN IF NOT EXISTS prompt_base text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS instrucciones_operativas text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS tono text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS objetivos_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS knowledge_base_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS acciones_habilitadas_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS reglas_guardrail_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS memoria_habilitada boolean NOT NULL DEFAULT true;

UPDATE bots
SET acciones_habilitadas_json = enabled_actions_json
WHERE acciones_habilitadas_json = '[]'::jsonb
  AND enabled_actions_json <> '[]'::jsonb;

CREATE TABLE IF NOT EXISTS bot_templates (
  template_id text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  prompt_base text NOT NULL,
  acciones_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb,
  campos_sugeridos jsonb NOT NULL DEFAULT '[]'::jsonb,
  reglas_guardrail_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb,
  reglas_escalamiento_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_base_sugerida jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  habilitado boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO bot_templates (
  template_id,
  nombre,
  descripcion,
  prompt_base,
  acciones_sugeridas,
  campos_sugeridos,
  reglas_guardrail_sugeridas,
  reglas_escalamiento_sugeridas,
  knowledge_base_sugerida,
  version,
  habilitado
)
VALUES
  (
    'recepcionista_ai',
    'Recepcionista AI',
    'Template editable para responder preguntas frecuentes, capturar datos y escalar a humano.',
    'Eres un asistente de recepción para un negocio. Responde con base en knowledge autorizado, captura datos básicos y escala cuando no tengas certeza.',
    '["responder_conocimiento","crear_contacto","actualizar_contacto","guardar_nota","solicitar_aprobacion_humana"]'::jsonb,
    '["nombre","telefono","motivo_contacto"]'::jsonb,
    '["No inventar información del negocio.","No prometer precios o disponibilidad si no está en knowledge.","Escalar preguntas sensibles o fuera de alcance."]'::jsonb,
    '["cliente pide humano","queja sensible","pregunta fuera de knowledge"]'::jsonb,
    '["servicios","horarios","ubicaciones","políticas","preguntas frecuentes"]'::jsonb,
    1,
    true
  ),
  (
    'seguimiento_ventas',
    'Seguimiento de ventas',
    'Template editable para calificar prospectos, crear tareas y preparar seguimiento comercial.',
    'Eres un asistente comercial. Identifica prospectos, captura interés, sugiere siguiente acción y crea seguimiento solo con acciones habilitadas.',
    '["crear_contacto","actualizar_contacto","crear_tarea","crear_recordatorio","guardar_nota","generar_resumen"]'::jsonb,
    '["nombre","telefono","interes","presupuesto","fecha_seguimiento"]'::jsonb,
    '["No autorizar descuentos.","No prometer disponibilidad no confirmada.","Escalar compras de alto valor o condiciones especiales."]'::jsonb,
    '["descuento solicitado","cliente molesto","compra de alto valor"]'::jsonb,
    '["servicios","precios","objeciones","criterios de venta","promociones"]'::jsonb,
    1,
    true
  ),
  (
    'agenda_facil',
    'Agenda fácil',
    'Template editable para recibir solicitudes de cita y preparar recordatorios.',
    'Eres un asistente de agenda. Reúne datos de cita, confirma información y solicita aprobación si una acción requiere humano.',
    '["crear_contacto","crear_recordatorio","guardar_nota","solicitar_aprobacion_humana"]'::jsonb,
    '["nombre","telefono","servicio","fecha_preferida","sucursal"]'::jsonb,
    '["No confirmar citas finales sin fuente autorizada.","Escalar cambios urgentes o excepciones."]'::jsonb,
    '["horario no disponible","cambio urgente","cliente VIP"]'::jsonb,
    '["horarios","sucursales","servicios","políticas de cita"]'::jsonb,
    1,
    true
  ),
  (
    'factura_facil',
    'Factura fácil',
    'Template editable para reunir datos fiscales y crear solicitudes internas de facturación.',
    'Eres un asistente de facturación. Reúne datos fiscales, revisa que la solicitud esté completa y crea solicitudes internas usando acciones habilitadas.',
    '["extraer_datos_de_imagen","crear_solicitud_facturacion","validar_datos_fiscales","guardar_nota","guardar_archivo"]'::jsonb,
    '["rfc","razon_social","regimen_fiscal","uso_cfdi","correo","monto","ticket"]'::jsonb,
    '["No emitir facturas reales.","No modificar facturas emitidas.","Pedir mejor imagen si el archivo no es legible."]'::jsonb,
    '["datos fiscales incompletos","archivo ilegible","cancelación o modificación de factura emitida"]'::jsonb,
    '["requisitos de facturación","políticas fiscales","correos de encargados"]'::jsonb,
    1,
    true
  ),
  (
    'documentos_facil',
    'Documentos fácil',
    'Template editable para pedir documentos, revisar faltantes y armar checklist.',
    'Eres un asistente documental. Revisa archivos recibidos contra una checklist y registra faltantes sin inventar validaciones.',
    '["guardar_archivo","extraer_datos_de_imagen","revisar_documentos_requeridos","crear_ticket","guardar_nota"]'::jsonb,
    '["nombre","tipo_tramite","documentos_recibidos","documentos_faltantes"]'::jsonb,
    '["No validar documentos sensibles como definitivos.","Escalar inconsistencias o documentos ilegibles."]'::jsonb,
    '["documento sensible","documento ilegible","inconsistencia en datos"]'::jsonb,
    '["documentos requeridos","criterios de validación","formatos aceptados"]'::jsonb,
    1,
    true
  ),
  (
    'cobranza_suave',
    'Cobranza suave',
    'Template editable para recordatorios de pago, promesas de pago y seguimiento cuidadoso.',
    'Eres un asistente de cobranza cuidadoso. Clasifica respuestas, registra promesas de pago y escala situaciones sensibles.',
    '["crear_recordatorio","guardar_nota","cambiar_estatus","generar_resumen","solicitar_aprobacion_humana"]'::jsonb,
    '["nombre","monto","fecha_promesa_pago","estatus_pago"]'::jsonb,
    '["No amenazar.","No prometer condonaciones.","Escalar situaciones legales o clientes molestos."]'::jsonb,
    '["cliente molesto","amenaza legal","descuento o convenio"]'::jsonb,
    '["políticas de cobranza","formas de pago","mensajes autorizados"]'::jsonb,
    1,
    true
  )
ON CONFLICT (template_id)
DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  prompt_base = EXCLUDED.prompt_base,
  acciones_sugeridas = EXCLUDED.acciones_sugeridas,
  campos_sugeridos = EXCLUDED.campos_sugeridos,
  reglas_guardrail_sugeridas = EXCLUDED.reglas_guardrail_sugeridas,
  reglas_escalamiento_sugeridas = EXCLUDED.reglas_escalamiento_sugeridas,
  knowledge_base_sugerida = EXCLUDED.knowledge_base_sugerida,
  version = EXCLUDED.version,
  habilitado = EXCLUDED.habilitado,
  updated_at = now();

CREATE TABLE IF NOT EXISTS discovery_questions (
  pregunta_id text PRIMARY KEY,
  bloque text NOT NULL,
  texto text NOT NULL,
  tipo_respuesta text NOT NULL DEFAULT 'texto',
  ayuda text,
  activa boolean NOT NULL DEFAULT true,
  orden integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO discovery_questions (pregunta_id, bloque, texto, tipo_respuesta, ayuda, activa, orden, version)
VALUES
  ('llegada_clientes_01', 'llegada_clientes', '¿De dónde llegan tus clientes?', 'texto', 'Canales principales: WhatsApp, llamadas, redes, referidos, sitio web.', true, 10, 1),
  ('llegada_clientes_02', 'llegada_clientes', '¿Cuántos mensajes o llamadas reciben al día?', 'numero_texto', 'Rango aproximado sirve.', true, 20, 1),
  ('llegada_clientes_03', 'llegada_clientes', '¿Quién responde?', 'texto', 'Persona, equipo o dueño.', true, 30, 1),
  ('llegada_clientes_04', 'llegada_clientes', '¿Qué pasa fuera de horario?', 'texto', 'Detectar oportunidades de respuesta automática o seguimiento.', true, 40, 1),
  ('llegada_clientes_05', 'llegada_clientes', '¿Dónde se pierden prospectos?', 'texto', 'Momentos donde dejan de responder o no se da seguimiento.', true, 50, 1),
  ('ventas_01', 'ventas', '¿Cómo cotizan?', 'texto', 'Manual, Excel, catálogo, sistema o criterio humano.', true, 10, 1),
  ('ventas_02', 'ventas', '¿Quién da seguimiento?', 'texto', 'Dueño, vendedor, recepción o nadie fijo.', true, 20, 1),
  ('ventas_03', 'ventas', '¿Cuánto tardan en responder?', 'texto', 'Tiempo promedio de primera respuesta.', true, 30, 1),
  ('ventas_04', 'ventas', '¿Cuántas veces intentan contactar antes de rendirse?', 'texto', 'Frecuencia de seguimiento.', true, 40, 1),
  ('ventas_05', 'ventas', '¿Quién autoriza descuentos?', 'texto', 'Detectar necesidad de aprobación humana.', true, 50, 1),
  ('tareas_repetitivas_01', 'tareas_repetitivas', '¿Qué hacen todos los días que les quita tiempo?', 'texto', null, true, 10, 1),
  ('tareas_repetitivas_02', 'tareas_repetitivas', '¿Qué mensajes copian y pegan?', 'texto', null, true, 20, 1),
  ('tareas_repetitivas_03', 'tareas_repetitivas', '¿Qué información piden siempre?', 'texto', null, true, 30, 1),
  ('tareas_repetitivas_04', 'tareas_repetitivas', '¿Qué se les olvida?', 'texto', null, true, 40, 1),
  ('documentos_y_capturas_01', 'documentos_y_capturas', '¿Reciben PDFs, fotos, tickets, facturas o comprobantes?', 'texto', null, true, 10, 1),
  ('documentos_y_capturas_02', 'documentos_y_capturas', '¿Qué datos necesitan extraer?', 'texto', null, true, 20, 1),
  ('documentos_y_capturas_03', 'documentos_y_capturas', '¿Usan capturas de sistemas?', 'texto', null, true, 30, 1),
  ('documentos_y_capturas_04', 'documentos_y_capturas', '¿Qué documentos deben revisar?', 'texto', null, true, 40, 1),
  ('sistemas_actuales_01', 'sistemas_actuales', '¿Usan Excel, CRM, punto de venta, Google Sheets, sistema administrativo?', 'texto', null, true, 10, 1),
  ('sistemas_actuales_02', 'sistemas_actuales', '¿Hay APIs o todo se maneja manual?', 'texto', null, true, 20, 1),
  ('sistemas_actuales_03', 'sistemas_actuales', '¿Se puede operar con capturas o archivos al inicio?', 'texto', null, true, 30, 1),
  ('llamadas_01', 'llamadas', '¿Cuántas llamadas hacen al día?', 'numero_texto', null, true, 10, 1),
  ('llamadas_02', 'llamadas', '¿Para qué llaman?', 'texto', null, true, 20, 1),
  ('llamadas_03', 'llamadas', '¿Qué llamadas se podrían automatizar o preparar?', 'texto', null, true, 30, 1),
  ('llamadas_04', 'llamadas', '¿Les serviría que un agente intente contactar y conecte con un vendedor?', 'texto', null, true, 40, 1),
  ('riesgo_y_aprobacion_01', 'riesgo_y_aprobacion', '¿Qué puede hacer el agente solo?', 'texto', null, true, 10, 1),
  ('riesgo_y_aprobacion_02', 'riesgo_y_aprobacion', '¿Qué debe aprobar un humano?', 'texto', null, true, 20, 1),
  ('riesgo_y_aprobacion_03', 'riesgo_y_aprobacion', '¿Qué nunca debe prometer?', 'texto', null, true, 30, 1),
  ('riesgo_y_aprobacion_04', 'riesgo_y_aprobacion', '¿Cuándo debe escalar?', 'texto', null, true, 40, 1)
ON CONFLICT (pregunta_id)
DO UPDATE SET
  bloque = EXCLUDED.bloque,
  texto = EXCLUDED.texto,
  tipo_respuesta = EXCLUDED.tipo_respuesta,
  ayuda = EXCLUDED.ayuda,
  activa = EXCLUDED.activa,
  orden = EXCLUDED.orden,
  version = EXCLUDED.version,
  updated_at = now();

CREATE TABLE IF NOT EXISTS bot_prompt_compilations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  prompt_version integer NOT NULL DEFAULT 1,
  acciones_disponibles jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_usado jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_prompt_compilations_bot_idx ON bot_prompt_compilations (bot_id, created_at);
CREATE INDEX IF NOT EXISTS bot_prompt_compilations_conversation_idx ON bot_prompt_compilations (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS bot_guardrail_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  action_id text,
  accion_sugerida text,
  descripcion text NOT NULL,
  prompt_fragment text,
  input_intentado jsonb,
  severidad text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'nuevo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bot_guardrail_events_bot_idx ON bot_guardrail_events (bot_id, created_at);
CREATE INDEX IF NOT EXISTS bot_guardrail_events_account_idx ON bot_guardrail_events (account_id, created_at);
CREATE INDEX IF NOT EXISTS bot_guardrail_events_tipo_idx ON bot_guardrail_events (tipo, created_at);

ALTER TABLE diagnosticos_ai ADD COLUMN IF NOT EXISTS bots_recomendados jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ============================================================
-- Squashed from 0010_bot_engine_preflight.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  note text NOT NULL,
  entity_id text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_notes_account_idx ON internal_notes (account_id, created_at);
CREATE INDEX IF NOT EXISTS internal_notes_bot_idx ON internal_notes (bot_id, created_at);
CREATE INDEX IF NOT EXISTS internal_notes_conversation_idx ON internal_notes (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS internal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
  titulo text NOT NULL,
  descripcion text,
  responsable_id text,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'pendiente',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS internal_tasks_account_idx ON internal_tasks (account_id, created_at);
CREATE INDEX IF NOT EXISTS internal_tasks_bot_idx ON internal_tasks (bot_id, created_at);
CREATE INDEX IF NOT EXISTS internal_tasks_status_idx ON internal_tasks (status, due_at);
