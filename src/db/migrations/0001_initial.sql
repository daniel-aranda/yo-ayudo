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
