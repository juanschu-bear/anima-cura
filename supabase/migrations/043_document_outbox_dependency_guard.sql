CREATE OR REPLACE FUNCTION claim_integration_outbox_job(
  p_artifact_type text,
  p_worker_id text,
  p_lease_minutes integer DEFAULT 15
)
RETURNS SETOF integration_outbox_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed_id uuid;
BEGIN
  IF p_artifact_type NOT IN ('patient', 'document', 'carteitext', 'billing') THEN
    RAISE EXCEPTION 'Unsupported artifact type: %', p_artifact_type;
  END IF;
  IF coalesce(trim(p_worker_id), '') = '' THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;

  SELECT job.id INTO claimed_id
  FROM integration_outbox_jobs AS job
  WHERE job.artifact_type = p_artifact_type
    AND (
      p_artifact_type <> 'document'
      OR EXISTS (
        SELECT 1
        FROM anamnese_submissions AS submission
        WHERE submission.id = job.artifact_id
          AND submission.ivoris_synced IS TRUE
          AND submission.ivoris_patient_id IS NOT NULL
      )
    )
    AND (
      (
        job.status IN ('queued', 'retry_wait')
        AND (job.next_attempt_at IS NULL OR job.next_attempt_at <= now())
      )
      OR (
        job.status = 'processing'
        AND job.locked_at < now() - make_interval(mins => greatest(1, p_lease_minutes))
      )
    )
  ORDER BY job.created_at, job.id
  FOR UPDATE OF job SKIP LOCKED
  LIMIT 1;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE integration_outbox_jobs
  SET status = 'processing',
      locked_at = now(),
      locked_by = p_worker_id,
      updated_at = now()
  WHERE id = claimed_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION claim_integration_outbox_job(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_integration_outbox_job(text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_integration_outbox_job(text, text, integer) TO service_role;

-- These document jobs represent an unresolved patient dependency, not a
-- document-specific fachliche manual-review decision.
UPDATE anamnese_submissions
SET
  ivoris_doc_failed_permanently = false,
  ivoris_doc_retry_count = 0,
  ivoris_doc_next_retry_at = NULL,
  ivoris_document_error = NULL,
  updated_at = now()
WHERE ivoris_doc_failed_permanently IS TRUE
  AND ivoris_doc_synced IS NOT TRUE
  AND (ivoris_synced IS NOT TRUE OR ivoris_patient_id IS NULL);

