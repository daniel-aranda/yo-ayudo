-- Repair local databases that marked older squashed migrations as applied
-- before the Bot Engine audit/action tables existed.

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

CREATE INDEX IF NOT EXISTS bots_paquete_idx ON bots (paquete_id);

UPDATE bots
SET acciones_habilitadas_json = enabled_actions_json
WHERE acciones_habilitadas_json = '[]'::jsonb
  AND enabled_actions_json <> '[]'::jsonb;

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
  bots_recomendados jsonb NOT NULL DEFAULT '[]'::jsonb,
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
