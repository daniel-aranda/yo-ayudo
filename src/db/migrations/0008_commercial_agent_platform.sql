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
