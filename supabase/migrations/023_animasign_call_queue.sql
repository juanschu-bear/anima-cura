-- ============================================================
-- Migration 023: AnimaSign outbound reminder calls
-- ============================================================

ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS call_status text
    CHECK (call_status IN ('pending', 'reached', 'not_reached', 'failed', 'skipped'));

ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS call_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS call_attempted_at timestamptz;

ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS call_completed_at timestamptz;

ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS call_duration_seconds integer NOT NULL DEFAULT 0;

UPDATE anamnese_submissions
SET call_status = 'pending'
WHERE call_status IS NULL
  AND status <> 'fehler';

CREATE INDEX IF NOT EXISTS idx_anamnese_call_queue
  ON anamnese_submissions (call_status, call_attempted_at, created_at DESC);
