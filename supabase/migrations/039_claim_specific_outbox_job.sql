CREATE OR REPLACE FUNCTION claim_integration_outbox_job_for_artifact(
  p_artifact_type text,
  p_artifact_id uuid,
  p_worker_id text,
  p_lease_minutes integer DEFAULT 15,
  p_force boolean DEFAULT false
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

  SELECT id INTO claimed_id
  FROM integration_outbox_jobs
  WHERE artifact_type = p_artifact_type
    AND artifact_id = p_artifact_id
    AND (
      (status IN ('queued', 'retry_wait') AND (p_force OR next_attempt_at IS NULL OR next_attempt_at <= now()))
      OR (status = 'processing' AND locked_by = p_worker_id)
      OR (status = 'processing' AND locked_at < now() - make_interval(mins => greatest(1, p_lease_minutes)))
    )
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF claimed_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE integration_outbox_jobs
  SET status = 'processing', locked_at = now(), locked_by = p_worker_id, updated_at = now()
  WHERE id = claimed_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION claim_integration_outbox_job_for_artifact(text, uuid, text, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_integration_outbox_job_for_artifact(text, uuid, text, integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION claim_integration_outbox_job_for_artifact(text, uuid, text, integer, boolean) TO service_role;
