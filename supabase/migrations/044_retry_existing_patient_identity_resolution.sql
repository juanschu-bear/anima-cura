-- Existing local patients without an IVORIS id now use the guarded directory
-- resolution path. Requeue only the historical error produced by the previous
-- implementation; ambiguous matches still become explicit manual review.
UPDATE anamnese_submissions
SET
  ivoris_sync_failed_permanently = false,
  ivoris_sync_next_retry_at = now(),
  ivoris_patient_error = NULL,
  ivoris_sync_error = NULL,
  updated_at = now()
WHERE ivoris_synced IS NOT TRUE
  AND coalesce(ivoris_patient_error, ivoris_sync_error, '') LIKE '%Bestandspatient hat keine gueltige ivoris_id%';

