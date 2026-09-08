ALTER TABLE anamnese_submissions
  ADD COLUMN IF NOT EXISTS ivoris_field_results jsonb NOT NULL DEFAULT '{}'::jsonb;
