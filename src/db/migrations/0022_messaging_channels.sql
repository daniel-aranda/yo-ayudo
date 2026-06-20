-- Facebook Messenger como canal de primera clase + identidad de contacto por
-- canal. Espejo exacto del modelo de Instagram (instagram_accounts +
-- instagram_account_bot_assignments): una organización/cuenta posee páginas de
-- Facebook y cada una se asigna a un bot activo a la vez (UNIQUE en active_key).
-- Instagram DM y Messenger comparten el mismo webhook (Messenger Platform), así
-- que el inbound es el mismo motor con adaptadores delgados por canal.

CREATE TABLE IF NOT EXISTS facebook_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  external_page_id text NOT NULL,
  page_name text,
  access_token text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (external_page_id)
);

CREATE INDEX IF NOT EXISTS facebook_pages_account_idx ON facebook_pages (account_id);

CREATE TABLE IF NOT EXISTS facebook_page_bot_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  facebook_page_id uuid NOT NULL REFERENCES facebook_pages(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',
  active_key text DEFAULT 'active',
  assignment_type text NOT NULL DEFAULT 'primary',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  unassigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facebook_page_id, active_key)
);

CREATE INDEX IF NOT EXISTS facebook_assignments_bot_idx ON facebook_page_bot_assignments (bot_id);

-- Token de página/cuenta para la Send API de Meta (Graph). Nullable y opcional:
-- sin token el cliente no envía (registra not_configured), nunca finge.
ALTER TABLE instagram_accounts ADD COLUMN IF NOT EXISTS access_token text;

-- Identidad de contacto por canal. Antes el contacto era whatsapp-only
-- (whatsapp_phone NOT NULL). Ahora `channel` + `external_id` (PSID de Messenger /
-- IGSID de Instagram / teléfono de WhatsApp) identifican al remitente. NO se hace
-- backfill ni se toca el índice de WhatsApp: el path de WhatsApp sigue intacto
-- (dedupe por whatsapp_phone); IG/FB deduplican por (account_id, channel,
-- external_id) en JS (mismo patrón pg-mem-safe que crm_clients).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE contacts ALTER COLUMN whatsapp_phone DROP NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_account_channel_external_idx ON contacts (account_id, channel, external_id);
