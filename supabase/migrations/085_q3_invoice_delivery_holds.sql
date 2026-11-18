-- Q3/2026: Families without a usable e-mail address must not receive payment
-- reminders or dunning notices before the practice confirms invoice handoff.
-- The hold is patient/document specific and its release is permanently audited.
BEGIN;

CREATE TABLE IF NOT EXISTS invoice_delivery_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  document_id uuid NOT NULL,
  quarter text NOT NULL CHECK (quarter ~ '^[0-9]{4}-Q[1-4]$'),
  reason text NOT NULL CHECK (reason IN ('no_usable_email', 'invalid_email')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by uuid,
  handoff_method text CHECK (handoff_method IN ('print', 'in_person', 'postal_mail', 'other')),
  release_note text,
  CONSTRAINT invoice_delivery_holds_release_complete CHECK (
    (status = 'active' AND released_at IS NULL AND released_by IS NULL AND handoff_method IS NULL)
    OR
    (status = 'released' AND released_at IS NOT NULL AND released_by IS NOT NULL AND handoff_method IS NOT NULL)
  ),
  UNIQUE (document_id, quarter)
);

CREATE INDEX IF NOT EXISTS idx_invoice_delivery_holds_active_patient
  ON invoice_delivery_holds(patient_id) WHERE status = 'active';

ALTER TABLE invoice_delivery_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE invoice_delivery_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE invoice_delivery_holds TO service_role;
GRANT SELECT ON TABLE invoice_delivery_holds TO authenticated;

DROP POLICY IF EXISTS invoice_delivery_holds_service_role ON invoice_delivery_holds;
CREATE POLICY invoice_delivery_holds_service_role ON invoice_delivery_holds
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS invoice_delivery_holds_practice_read ON invoice_delivery_holds;
CREATE POLICY invoice_delivery_holds_practice_read ON invoice_delivery_holds
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'verwaltung')
    )
  );

CREATE OR REPLACE FUNCTION confirm_invoice_delivery_handoff(
  p_document_id uuid,
  p_method text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_role text;
  changed invoice_delivery_holds%ROWTYPE;
BEGIN
  SELECT role INTO actor_role FROM user_profiles WHERE id = actor;
  IF actor IS NULL OR actor_role NOT IN ('admin', 'verwaltung') THEN
    RAISE EXCEPTION 'invoice_handoff_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_method NOT IN ('print', 'in_person', 'postal_mail', 'other') THEN
    RAISE EXCEPTION 'invoice_handoff_method_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE invoice_delivery_holds
  SET status = 'released', released_at = now(), released_by = actor,
      handoff_method = p_method, release_note = nullif(trim(p_note), '')
  WHERE document_id = p_document_id AND status = 'active'
  RETURNING * INTO changed;

  IF NOT FOUND THEN
    SELECT * INTO changed FROM invoice_delivery_holds
    WHERE document_id = p_document_id AND status = 'released';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'invoice_handoff_hold_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'documentId', changed.document_id,
    'patientId', changed.patient_id,
    'status', changed.status,
    'releasedAt', changed.released_at,
    'releasedBy', changed.released_by,
    'handoffMethod', changed.handoff_method
  );
END $$;

REVOKE ALL ON FUNCTION confirm_invoice_delivery_handoff(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION confirm_invoice_delivery_handoff(uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
