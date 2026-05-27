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
