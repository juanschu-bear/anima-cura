ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS ivoris_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ivoris_doc_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ivoris_sync_error text,
  ADD COLUMN IF NOT EXISTS is_existing boolean,
  ADD COLUMN IF NOT EXISTS matched_patient_id uuid REFERENCES patients(id),
  ADD COLUMN IF NOT EXISTS ivoris_sync_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ivoris_doc_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ivoris_sync_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS ivoris_doc_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS ivoris_sync_failed_permanently boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ivoris_doc_failed_permanently boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_anamnese_ivoris_pending
  ON anamnese_submissions (ivoris_synced, ivoris_doc_synced, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_anamnese_ivoris_retry
  ON anamnese_submissions (ivoris_sync_next_retry_at, ivoris_doc_next_retry_at);

CREATE TABLE IF NOT EXISTS animasign_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES anamnese_submissions(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('patient', 'document')),
  attempt_no integer NOT NULL,
  status text NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  error_text text,
  request_payload jsonb,
  response_payload jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_animasign_sync_log_submission_stage
  ON animasign_sync_log (submission_id, stage, attempt_no DESC);

ALTER TABLE animasign_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS animasign_sync_log_authenticated ON animasign_sync_log;
CREATE POLICY animasign_sync_log_authenticated ON animasign_sync_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS animasign_sync_log_service ON animasign_sync_log;
CREATE POLICY animasign_sync_log_service ON animasign_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
