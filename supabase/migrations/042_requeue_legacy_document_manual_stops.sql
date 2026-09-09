-- Repair six legacy document stops that are dependency states, not fachliche
-- manual-review decisions. No patient, document or Scribe content is deleted.

UPDATE anamnese_submissions AS submission
SET
  ivoris_patient_id = patient.ivoris_id,
  ivoris_doc_failed_permanently = false,
  ivoris_doc_retry_count = 0,
  ivoris_doc_next_retry_at = now(),
  ivoris_document_error = NULL,
  updated_at = now()
FROM patients AS patient
WHERE submission.ivoris_doc_failed_permanently IS TRUE
  AND submission.ivoris_doc_synced IS NOT TRUE
  AND submission.ivoris_patient_id IS NULL
  AND patient.id = coalesce(submission.matched_patient_id, submission.patient_id)
  AND patient.ivoris_id IS NOT NULL;

UPDATE anamnese_submissions
SET
  ivoris_doc_failed_permanently = false,
  ivoris_doc_retry_count = 0,
  ivoris_doc_next_retry_at = now(),
  ivoris_document_error = NULL,
  updated_at = now()
WHERE ivoris_doc_failed_permanently IS TRUE
  AND ivoris_doc_synced IS NOT TRUE
  AND ivoris_synced IS NOT TRUE;

