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
