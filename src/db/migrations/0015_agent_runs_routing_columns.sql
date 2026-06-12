-- Ensure agent_runs has the routing-decision columns. They are defined in 0001
-- via ALTER ... ADD COLUMN IF NOT EXISTS, but databases that applied an older
-- 0001 (before those columns existed) never got them and won't re-run 0001.
-- This migration re-applies them idempotently so create_agent_run (which writes
-- these columns) works everywhere; a no-op where they already exist.

ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_id text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_name text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_type text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_reason text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_confidence numeric(5, 4);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_candidates_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS used_context_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS handoff_recommended boolean NOT NULL DEFAULT false;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS handoff_reason text;
