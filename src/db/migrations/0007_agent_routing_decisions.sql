ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_id text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_name text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS selected_agent_type text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_reason text;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_confidence numeric(5, 4);
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS routing_candidates_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS used_context_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS handoff_recommended boolean NOT NULL DEFAULT false;
ALTER TABLE agent_runs ADD COLUMN IF NOT EXISTS handoff_reason text;

CREATE INDEX IF NOT EXISTS agent_runs_selected_agent_idx ON agent_runs (selected_agent_id);
CREATE INDEX IF NOT EXISTS agent_runs_handoff_idx ON agent_runs (handoff_recommended, created_at);
