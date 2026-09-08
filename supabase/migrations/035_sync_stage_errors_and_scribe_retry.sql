ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS ivoris_patient_error text,
  ADD COLUMN IF NOT EXISTS ivoris_document_error text;

ALTER TABLE doku_eintraege
  ADD COLUMN IF NOT EXISTS ivoris_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ivoris_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS ivoris_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS ivoris_error_class text;

CREATE INDEX IF NOT EXISTS idx_doku_ivoris_retry_due
  ON doku_eintraege (ivoris_next_retry_at, bestaetigt_am)
  WHERE status = 'bestaetigt' AND ivoris_push_status IN ('ausstehend', 'fehler');
