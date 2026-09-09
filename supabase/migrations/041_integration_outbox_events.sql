CREATE TABLE IF NOT EXISTS integration_outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  artifact_type text NOT NULL,
  artifact_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'transition', 'deleted', 'snapshot')),
  previous_status text,
  new_status text,
  attempt_count integer NOT NULL DEFAULT 0,
  error_category text,
  worker_id text,
  next_attempt_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_events_job
  ON integration_outbox_events (job_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_events_artifact
  ON integration_outbox_events (artifact_type, artifact_id, occurred_at DESC);

ALTER TABLE integration_outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_outbox_events_authenticated_read ON integration_outbox_events;
CREATE POLICY integration_outbox_events_authenticated_read ON integration_outbox_events
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION record_integration_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source integration_outbox_jobs%ROWTYPE;
  category text;
BEGIN
  source := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  category := CASE
    WHEN source.last_error ~ '\((502|503|504)\)' THEN substring(source.last_error FROM '\((502|503|504)\)')
    WHEN source.last_error ~* 'timeout|timed out' THEN 'timeout'
    WHEN source.last_error ~* 'fetch failed|network|econnreset|econnrefused|socket' THEN 'network'
    WHEN source.last_error IS NOT NULL THEN 'other'
    ELSE NULL
  END;

  INSERT INTO integration_outbox_events (
    job_id, artifact_type, artifact_id, event_type, previous_status, new_status,
    attempt_count, error_category, worker_id, next_attempt_at
  ) VALUES (
    source.id,
    source.artifact_type,
    source.artifact_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' WHEN TG_OP = 'DELETE' THEN 'deleted' ELSE 'transition' END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.status ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.status ELSE NULL END,
    source.attempt_count,
    category,
    source.locked_by,
    source.next_attempt_at
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_integration_outbox_event ON integration_outbox_jobs;
CREATE TRIGGER trg_record_integration_outbox_event
AFTER INSERT OR UPDATE OF status, attempt_count, next_attempt_at, last_error, locked_at, locked_by, succeeded_at
OR DELETE ON integration_outbox_jobs
FOR EACH ROW EXECUTE FUNCTION record_integration_outbox_event();

INSERT INTO integration_outbox_events (
  job_id, artifact_type, artifact_id, event_type, previous_status, new_status,
  attempt_count, error_category, worker_id, next_attempt_at, occurred_at
)
SELECT
  id,
  artifact_type,
  artifact_id,
  'snapshot',
  NULL,
  status,
  attempt_count,
  CASE
    WHEN last_error ~ '\((502|503|504)\)' THEN substring(last_error FROM '\((502|503|504)\)')
    WHEN last_error ~* 'timeout|timed out' THEN 'timeout'
    WHEN last_error ~* 'fetch failed|network|econnreset|econnrefused|socket' THEN 'network'
    WHEN last_error IS NOT NULL THEN 'other'
    ELSE NULL
  END,
  locked_by,
  next_attempt_at,
  now()
FROM integration_outbox_jobs;

