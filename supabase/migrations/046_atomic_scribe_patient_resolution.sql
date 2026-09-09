CREATE TABLE IF NOT EXISTS integration_manual_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_type text NOT NULL CHECK (artifact_type IN ('carteitext')),
  artifact_id uuid NOT NULL,
  previous_patient_id uuid,
  resolved_patient_id uuid NOT NULL,
  resolved_by uuid NOT NULL,
  resolved_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_manual_resolutions_artifact
  ON integration_manual_resolutions (artifact_type, artifact_id, resolved_at DESC);

ALTER TABLE integration_manual_resolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS integration_manual_resolutions_authenticated_read ON integration_manual_resolutions;
CREATE POLICY integration_manual_resolutions_authenticated_read ON integration_manual_resolutions
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION resolve_scribe_patient_atomic(
  p_entry_id uuid,
  p_patient_id uuid,
  p_resolved_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entry_row doku_eintraege%ROWTYPE;
  target_ivoris_id text;
BEGIN
  IF p_resolved_by IS NULL THEN
    RAISE EXCEPTION 'resolved_by is required';
  END IF;

  SELECT * INTO entry_row
  FROM doku_eintraege
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Scribe entry not found'; END IF;
  IF entry_row.status <> 'bestaetigt' OR entry_row.ivoris_push_status = 'gepusht' THEN
    RAISE EXCEPTION 'Scribe entry is not resolvable';
  END IF;
  IF entry_row.ivoris_error_class <> 'patient_manual_review' THEN
    RAISE EXCEPTION 'Scribe entry does not require patient resolution';
  END IF;

  SELECT ivoris_id INTO target_ivoris_id
  FROM patients
  WHERE id = p_patient_id;

  IF target_ivoris_id IS NULL OR target_ivoris_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Selected patient has no valid IVORIS id';
  END IF;

  UPDATE doku_eintraege
  SET
    patient_id = p_patient_id,
    ivoris_push_status = 'ausstehend',
    ivoris_fehler = NULL,
    ivoris_retry_count = 0,
    ivoris_next_retry_at = NULL,
    ivoris_error_class = NULL
  WHERE id = p_entry_id;

  INSERT INTO integration_manual_resolutions (
    artifact_type, artifact_id, previous_patient_id, resolved_patient_id, resolved_by
  ) VALUES (
    'carteitext', p_entry_id, entry_row.patient_id, p_patient_id, p_resolved_by
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION resolve_scribe_patient_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_scribe_patient_atomic(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION resolve_scribe_patient_atomic(uuid, uuid, uuid) TO service_role;

