-- Usuarios para login: el owner de la plataforma (is_platform_owner, sin
-- organization) y usuarios de negocio (organization_id). Password con scrypt
-- en Node (password_hash = "scrypt:salt:hash"). La unicidad de email se
-- garantiza en el repositorio (emails normalizados a minúsculas al escribir).
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_owner boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_organization_idx ON users (organization_id);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
