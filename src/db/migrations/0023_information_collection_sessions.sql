-- Sesiones de "recolectar información": entrevista abierta multi-turno guiada por
-- IA, con MEMORIA VIVA del avance. Es estado OPERATIVO (no conocimiento), por eso
-- vive en su propia tabla indexada y no en memory_documents. Una sesión "captura"
-- la conversación mientras está `collecting`; al cerrar queda `ready` (en cola,
-- reutilizable) hasta que una interacción de generación la `consume` (→ completed).

CREATE TABLE IF NOT EXISTS information_collection_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  account_id uuid,
  bot_id uuid,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id uuid,
  action_id text NOT NULL DEFAULT 'recolectar_informacion',
  objective text,
  guidance text,
  status text NOT NULL DEFAULT 'collecting',
  findings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  transcript_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_question text,
  turn_count integer NOT NULL DEFAULT 0,
  max_turns integer NOT NULL DEFAULT 8,
  completion_reason text,
  follow_up_action text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS info_collection_conversation_idx ON information_collection_sessions (conversation_id, status);
CREATE INDEX IF NOT EXISTS info_collection_account_idx ON information_collection_sessions (account_id, status);
