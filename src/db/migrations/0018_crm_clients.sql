-- CRM clients (prospectos y clientes). Un registro tiene un id interno estable y
-- varios identificadores de negocio (curp, telefono, instagram, email). La clave
-- de negocio se DERIVA por prioridad (CURP > telefono > instagram > email > id) y
-- vive denormalizada en client_key/client_key_type: puede "mutar" cuando llega un
-- identificador de mayor prioridad, mientras el id nunca cambia.
--
-- La deduplicacion/resolucion de identidad se hace en JS (crm_repository.js) por
-- match de cualquier identificador dentro de la cuenta — no con indices unicos
-- parciales (pg-mem no los soporta de forma confiable y la regla es agregar
-- constraints cuando el dato ya este estable, ver knowledge/architecture/database.md).

CREATE TABLE IF NOT EXISTS crm_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  bot_id uuid REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  display_name text,
  curp text,
  phone text,
  instagram text,
  email text,
  client_key text,
  client_key_type text NOT NULL DEFAULT 'internal',
  kind text NOT NULL DEFAULT 'prospecto',
  pipeline_status text NOT NULL DEFAULT 'nuevo',
  source text,
  need text,
  notes text,
  assigned_to text,
  identifiers_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_clients_account_idx ON crm_clients (account_id);
CREATE INDEX IF NOT EXISTS crm_clients_curp_idx ON crm_clients (account_id, curp);
CREATE INDEX IF NOT EXISTS crm_clients_phone_idx ON crm_clients (account_id, phone);
CREATE INDEX IF NOT EXISTS crm_clients_instagram_idx ON crm_clients (account_id, instagram);
CREATE INDEX IF NOT EXISTS crm_clients_email_idx ON crm_clients (account_id, email);
CREATE INDEX IF NOT EXISTS crm_clients_client_key_idx ON crm_clients (account_id, client_key);
CREATE INDEX IF NOT EXISTS crm_clients_conversation_idx ON crm_clients (conversation_id);
