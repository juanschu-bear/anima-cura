-- Deterministic client/data rejections require intervention; only request
-- timeout, too-early and rate-limit responses remain automatic retries.
UPDATE anamnese_submissions
SET
  ivoris_sync_failed_permanently = true,
  ivoris_sync_next_retry_at = NULL,
  updated_at = now()
WHERE ivoris_synced IS NOT TRUE
  AND coalesce(ivoris_patient_error, '') ~ '\((400|401|402|403|404|405|406|407|409|410|411|412|413|414|415|416|417|418|421|422|423|424|426|428|430|431|451)\)';

UPDATE anamnese_submissions
SET
  ivoris_doc_failed_permanently = true,
  ivoris_doc_next_retry_at = NULL,
  updated_at = now()
WHERE ivoris_doc_synced IS NOT TRUE
  AND coalesce(ivoris_document_error, '') ~ '\((400|401|402|403|404|405|406|407|409|410|411|412|413|414|415|416|417|418|421|422|423|424|426|428|430|431|451)\)';

