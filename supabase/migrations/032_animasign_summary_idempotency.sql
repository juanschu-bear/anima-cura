ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS ivoris_summary_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ivoris_summary_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS ivoris_summary_hash text;

UPDATE anamnese_submissions
SET ivoris_summary_synced = false
WHERE ivoris_summary_synced IS DISTINCT FROM true;
