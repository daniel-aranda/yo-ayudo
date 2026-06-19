-- Ordenamiento manual del tablero CRM (drag & drop dentro de una columna).
-- `pipeline_rank` es un string lexicográficamente ordenable (LexoRank-style): los
-- prospectos de una columna se ordenan por este valor (ascendente). El rank se
-- genera en JS (src/crm/lexorank.js, midstring entre vecinos), así reordenar
-- inserta una tarjeta entre otras dos sin renumerar al resto.
--
-- Nullable + lazy: las filas existentes no tienen rank y caen al fallback por
-- created_at; los ranks se materializan por columna en el primer reorder
-- (crm_repository.backfill_column_ranks). No hacemos backfill en SQL para no
-- depender de window functions (pg-mem no las soporta de forma confiable).
ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS pipeline_rank text;

CREATE INDEX IF NOT EXISTS idx_crm_clients_account_status_rank
  ON crm_clients (account_id, pipeline_status, pipeline_rank);
