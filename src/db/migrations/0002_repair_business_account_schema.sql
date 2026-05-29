-- Repair older local databases that marked the squashed initial migration as
-- applied before the business/account/bot columns existed.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_tenant_unique ON accounts (tenant_id);
CREATE INDEX IF NOT EXISTS accounts_organization_idx ON accounts (organization_id);

ALTER TABLE whatsapp_phone_numbers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_phone_numbers ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS whatsapp_phone_numbers_account_idx ON whatsapp_phone_numbers (account_id);
CREATE INDEX IF NOT EXISTS whatsapp_phone_numbers_organization_idx ON whatsapp_phone_numbers (organization_id);

ALTER TABLE bots ADD COLUMN IF NOT EXISTS bot_type text NOT NULL DEFAULT 'system';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS definition_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS definition_version integer NOT NULL DEFAULT 1;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS paquete_id text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS enabled_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS reglas_escalamiento_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS campos_requeridos_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS prompt_base text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS instrucciones_operativas text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS tono text;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS objetivos_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS knowledge_base_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS acciones_habilitadas_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS reglas_guardrail_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS memoria_habilitada boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS bots_account_type_status_idx ON bots (account_id, bot_type, status);
CREATE INDEX IF NOT EXISTS bots_organization_type_status_idx ON bots (organization_id, bot_type, status);
CREATE INDEX IF NOT EXISTS bots_paquete_idx ON bots (paquete_id);

ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES bots(id) ON DELETE CASCADE;
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS source_family text NOT NULL DEFAULT 'business_knowledge';
CREATE INDEX IF NOT EXISTS knowledge_sources_organization_idx ON knowledge_sources (organization_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_account_idx ON knowledge_sources (account_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_bot_idx ON knowledge_sources (bot_id);
CREATE INDEX IF NOT EXISTS knowledge_sources_family_scope_idx ON knowledge_sources (source_family, scope);

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
CREATE INDEX IF NOT EXISTS memory_documents_organization_idx ON memory_documents (organization_id);
CREATE INDEX IF NOT EXISTS memory_documents_account_idx ON memory_documents (account_id);
CREATE INDEX IF NOT EXISTS memory_documents_family_scope_type_idx
  ON memory_documents (document_family, scope, document_type);
