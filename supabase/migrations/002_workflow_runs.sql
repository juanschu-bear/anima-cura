-- ============================================================
-- ANIMA CURA – Workflow Runtime (Migration 002)
-- ============================================================
-- Adds the runtime layer for the visual workflow builder:
--   * workflow_runs            — one row per execution attempt
--   * workflow_versions        — version history with restore
--   * workflow_patient_states  — which patient currently sits in
--                                which workflow / which node
-- ============================================================

-- ─── workflow_runs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  TEXT NOT NULL,                            -- matches Workflow.id (string)
  patient_id   UUID REFERENCES patienten(id) ON DELETE SET NULL,
  trigger_kind TEXT NOT NULL,                            -- "rate_overdue" | "before_due" | "holiday" | "patient_birthday" | …
  status       TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','success','failed','skipped','dry_run')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  duration_ms  INTEGER,
  trigger_payload JSONB,
  steps        JSONB NOT NULL DEFAULT '[]'::jsonb,        -- [{node_id, kind, status, started_at, finished_at, output, error}]
  error        TEXT,
  is_test      BOOLEAN NOT NULL DEFAULT FALSE             -- TRUE when launched as Dry-Run from the editor
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at  ON workflow_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status      ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_patient_id  ON workflow_runs(patient_id);

-- ─── workflow_versions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id TEXT NOT NULL,
  version     INTEGER NOT NULL,                           -- monotonically increasing per workflow
  snapshot    JSONB NOT NULL,                             -- full Workflow object at this point in time
  author      TEXT,                                       -- optional, future user attribution
  note        TEXT,                                       -- optional commit-style message
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_id
  ON workflow_versions(workflow_id, version DESC);

-- ─── workflow_patient_states ────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_patient_states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id TEXT NOT NULL,
  patient_id  UUID NOT NULL REFERENCES patienten(id) ON DELETE CASCADE,
  current_node_id TEXT,
  state       TEXT NOT NULL DEFAULT 'active'
                CHECK (state IN ('active','waiting','completed','exited','failed')),
  context     JSONB NOT NULL DEFAULT '{}'::jsonb,         -- per-patient variables for the run
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_action_at TIMESTAMPTZ,                             -- for wait/delay nodes
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, patient_id)
);

CREATE INDEX IF NOT EXISTS idx_wps_workflow_id     ON workflow_patient_states(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wps_next_action_at  ON workflow_patient_states(next_action_at)
  WHERE state = 'waiting';

-- ─── Realtime ───────────────────────────────────────────────
-- Enable Supabase Realtime on the run table so the editor can light
-- up node badges while a run is in progress.
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_patient_states;
