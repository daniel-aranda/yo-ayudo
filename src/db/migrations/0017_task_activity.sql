-- Seguimiento de tareas internas: quién la atendió y qué pasó.
-- `assigned_to`: responsable actual (texto libre o nombre del usuario logueado).
-- `task_updates`: bitácora de actualizaciones (cambios de estado + notas) para
-- que un humano vea el follow-up completo de una tarea, no solo su estado actual.

ALTER TABLE internal_tasks ADD COLUMN IF NOT EXISTS assigned_to text;

CREATE TABLE IF NOT EXISTS task_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES internal_tasks(id) ON DELETE CASCADE,
  actor text,
  note text,
  from_status text,
  to_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_updates_task_idx ON task_updates (task_id, created_at);
