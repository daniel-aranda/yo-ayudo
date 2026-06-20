-- Adjuntos de conversación (imágenes, documentos, audio…) que llegan por un canal
-- (WhatsApp hoy; channel-agnostic para Instagram cuando exista su inbound).
-- El binario se guarda en S3 (o local como fallback de dev sin keys) y aquí queda
-- el descriptor de DÓNDE quedó + su metadata. Un mensaje puede tener N adjuntos.
-- DDL dentro del vocabulario pg-mem-safe del resto de migraciones.
CREATE TABLE IF NOT EXISTS message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  organization_id uuid,
  account_id uuid,
  channel text NOT NULL DEFAULT 'whatsapp',
  provider text NOT NULL,            -- 's3' | 'local'
  bucket text,
  s3_key text,
  local_path text,
  region text,
  mime_type text,
  size_bytes integer,
  original_filename text,
  source_media_id text,              -- id de media del canal (Meta) o url de origen
  status text NOT NULL DEFAULT 'stored',  -- 'stored' | 'failed'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_attachments_message_idx ON message_attachments (message_id);
