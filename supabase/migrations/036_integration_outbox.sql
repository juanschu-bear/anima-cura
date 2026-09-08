CREATE TABLE IF NOT EXISTS integration_outbox_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type text NOT NULL CHECK (artifact_type IN ('patient', 'document', 'carteitext', 'billing')),
  artifact_id uuid NOT NULL,
  artifact_version integer,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'retry_wait', 'manual_review', 'succeeded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz,
  last_error text,
  locked_at timestamptz,
  locked_by text,
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_outbox_due
  ON integration_outbox_jobs (artifact_type, status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'retry_wait');

CREATE INDEX IF NOT EXISTS idx_integration_outbox_artifact
  ON integration_outbox_jobs (artifact_type, artifact_id, created_at DESC);

ALTER TABLE integration_outbox_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_outbox_service_role ON integration_outbox_jobs;
CREATE POLICY integration_outbox_service_role ON integration_outbox_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS integration_outbox_authenticated_read ON integration_outbox_jobs;
CREATE POLICY integration_outbox_authenticated_read ON integration_outbox_jobs
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION sync_animasign_outbox_jobs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  patient_status text;
  document_status text;
BEGIN
  patient_status := CASE
    WHEN NEW.ivoris_synced THEN 'succeeded'
    WHEN NEW.ivoris_sync_failed_permanently THEN 'manual_review'
    WHEN NEW.ivoris_sync_next_retry_at IS NOT NULL AND NEW.ivoris_sync_next_retry_at > now() THEN 'retry_wait'
    ELSE 'queued'
  END;

  INSERT INTO integration_outbox_jobs (
    artifact_type, artifact_id, idempotency_key, status, attempt_count,
    next_attempt_at, last_error, succeeded_at, updated_at
  ) VALUES (
    'patient', NEW.id, 'animasign:' || NEW.id || ':patient', patient_status,
    coalesce(NEW.ivoris_sync_retry_count, 0), NEW.ivoris_sync_next_retry_at,
    NEW.ivoris_patient_error,
    CASE WHEN patient_status = 'succeeded' THEN now() ELSE NULL END, now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    status = excluded.status,
    attempt_count = excluded.attempt_count,
    next_attempt_at = excluded.next_attempt_at,
    last_error = excluded.last_error,
    succeeded_at = CASE
      WHEN excluded.status = 'succeeded' THEN coalesce(integration_outbox_jobs.succeeded_at, now())
      ELSE NULL
    END,
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now();

  IF NEW.signed_pdf_path IS NOT NULL THEN
    document_status := CASE
      WHEN NEW.ivoris_doc_synced THEN 'succeeded'
      WHEN NEW.ivoris_doc_failed_permanently THEN 'manual_review'
      WHEN NOT NEW.ivoris_synced THEN 'retry_wait'
      WHEN NEW.ivoris_doc_next_retry_at IS NOT NULL AND NEW.ivoris_doc_next_retry_at > now() THEN 'retry_wait'
      ELSE 'queued'
    END;

    INSERT INTO integration_outbox_jobs (
      artifact_type, artifact_id, idempotency_key, status, attempt_count,
      next_attempt_at, last_error, succeeded_at, updated_at
    ) VALUES (
      'document', NEW.id, 'animasign:' || NEW.id || ':document', document_status,
      coalesce(NEW.ivoris_doc_retry_count, 0),
      CASE WHEN NOT NEW.ivoris_synced THEN NULL ELSE NEW.ivoris_doc_next_retry_at END,
      NEW.ivoris_document_error,
      CASE WHEN document_status = 'succeeded' THEN now() ELSE NULL END, now()
    )
    ON CONFLICT (idempotency_key) DO UPDATE SET
      status = excluded.status,
      attempt_count = excluded.attempt_count,
      next_attempt_at = excluded.next_attempt_at,
      last_error = excluded.last_error,
      succeeded_at = CASE
        WHEN excluded.status = 'succeeded' THEN coalesce(integration_outbox_jobs.succeeded_at, now())
        ELSE NULL
      END,
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_animasign_outbox_jobs ON anamnese_submissions;
CREATE TRIGGER trg_sync_animasign_outbox_jobs
AFTER INSERT OR UPDATE OF signed_pdf_path, ivoris_synced, ivoris_doc_synced,
  ivoris_sync_retry_count, ivoris_doc_retry_count, ivoris_sync_next_retry_at,
  ivoris_doc_next_retry_at, ivoris_sync_failed_permanently,
  ivoris_doc_failed_permanently, ivoris_patient_error, ivoris_document_error
ON anamnese_submissions
FOR EACH ROW EXECUTE FUNCTION sync_animasign_outbox_jobs();

CREATE OR REPLACE FUNCTION sync_scribe_outbox_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_status text;
  job_key text;
BEGIN
  IF NEW.status <> 'bestaetigt' OR NEW.bestaetigt_am IS NULL THEN
    RETURN NEW;
  END IF;

  job_status := CASE
    WHEN NEW.ivoris_push_status = 'gepusht' THEN 'succeeded'
    WHEN NEW.ivoris_error_class = 'patient_manual_review' THEN 'manual_review'
    WHEN NEW.ivoris_next_retry_at IS NOT NULL AND NEW.ivoris_next_retry_at > now() THEN 'retry_wait'
    ELSE 'queued'
  END;
  job_key := 'scribe:' || NEW.id || ':v' || coalesce(NEW.version, 1);

  INSERT INTO integration_outbox_jobs (
    artifact_type, artifact_id, artifact_version, idempotency_key, status,
    attempt_count, next_attempt_at, last_error, succeeded_at, updated_at
  ) VALUES (
    'carteitext', NEW.id, coalesce(NEW.version, 1), job_key, job_status,
    coalesce(NEW.ivoris_retry_count, 0), NEW.ivoris_next_retry_at, NEW.ivoris_fehler,
    CASE WHEN job_status = 'succeeded' THEN coalesce(NEW.ivoris_gepusht_am, now()) ELSE NULL END,
    now()
  )
  ON CONFLICT (idempotency_key) DO UPDATE SET
    status = excluded.status,
    attempt_count = excluded.attempt_count,
    next_attempt_at = excluded.next_attempt_at,
    last_error = excluded.last_error,
    succeeded_at = CASE
      WHEN excluded.status = 'succeeded' THEN coalesce(integration_outbox_jobs.succeeded_at, excluded.succeeded_at)
      ELSE NULL
    END,
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_scribe_outbox_job ON doku_eintraege;
CREATE TRIGGER trg_sync_scribe_outbox_job
AFTER INSERT OR UPDATE OF status, bestaetigt_am, version, ivoris_push_status,
  ivoris_fehler, ivoris_retry_count, ivoris_next_retry_at,
  ivoris_error_class, ivoris_gepusht_am
ON doku_eintraege
FOR EACH ROW EXECUTE FUNCTION sync_scribe_outbox_job();

-- Backfill existing artifacts through the same trigger functions.
UPDATE anamnese_submissions
SET ivoris_sync_retry_count = ivoris_sync_retry_count;

UPDATE doku_eintraege
SET ivoris_retry_count = ivoris_retry_count
WHERE status = 'bestaetigt' AND bestaetigt_am IS NOT NULL;
