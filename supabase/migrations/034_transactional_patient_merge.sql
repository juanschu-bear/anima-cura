CREATE TABLE IF NOT EXISTS patient_merge_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_patient_id uuid NOT NULL,
  target_patient_id uuid NOT NULL REFERENCES patients(id),
  reason text NOT NULL,
  source_snapshot jsonb NOT NULL,
  target_snapshot_before jsonb NOT NULL,
  moved_references jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE patient_merge_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_merge_audit_service_read ON patient_merge_audit;
CREATE POLICY patient_merge_audit_service_read ON patient_merge_audit
  FOR SELECT TO service_role USING (true);

CREATE OR REPLACE FUNCTION reject_patient_merge_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'patient_merge_audit is immutable';
END;
$$;

DROP TRIGGER IF EXISTS patient_merge_audit_immutable ON patient_merge_audit;
CREATE TRIGGER patient_merge_audit_immutable
  BEFORE UPDATE OR DELETE ON patient_merge_audit
  FOR EACH ROW EXECUTE FUNCTION reject_patient_merge_audit_mutation();

CREATE OR REPLACE FUNCTION merge_patient_into_canonical(
  p_source_patient_id uuid,
  p_target_patient_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_row patients%ROWTYPE;
  target_row patients%ROWTYPE;
  source_snapshot jsonb;
  target_snapshot jsonb;
  moved jsonb := '{}'::jsonb;
  changed integer;
  normalized_source_last text;
  normalized_target_last text;
BEGIN
  IF p_source_patient_id = p_target_patient_id THEN
    RAISE EXCEPTION 'source and target patient must differ';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'merge reason is required';
  END IF;

  SELECT * INTO source_row FROM patients WHERE id = p_source_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'source patient not found'; END IF;
  SELECT * INTO target_row FROM patients WHERE id = p_target_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'target patient not found'; END IF;

  IF source_row.ivoris_id IS NOT NULL THEN
    RAISE EXCEPTION 'source patient already has an IVORIS id';
  END IF;
  IF target_row.ivoris_id IS NULL THEN
    RAISE EXCEPTION 'canonical target has no IVORIS id';
  END IF;
  IF source_row.geburtsdatum IS DISTINCT FROM target_row.geburtsdatum THEN
    RAISE EXCEPTION 'patient birthdays do not match';
  END IF;

  normalized_source_last := replace(replace(replace(lower(trim(source_row.nachname)), 'ä', 'a'), 'ö', 'o'), 'ü', 'u');
  normalized_target_last := replace(replace(replace(lower(trim(target_row.nachname)), 'ä', 'a'), 'ö', 'o'), 'ü', 'u');
  IF normalized_source_last IS DISTINCT FROM normalized_target_last THEN
    RAISE EXCEPTION 'patient last names do not match';
  END IF;

  source_snapshot := to_jsonb(source_row);
  target_snapshot := to_jsonb(target_row);

  UPDATE patients
  SET
    anrede = coalesce(nullif(anrede, ''), source_row.anrede),
    geschlecht = coalesce(geschlecht, source_row.geschlecht),
    telefon = coalesce(nullif(telefon, ''), source_row.telefon),
    mobiltelefon = coalesce(nullif(mobiltelefon, ''), source_row.mobiltelefon),
    email = coalesce(nullif(email, ''), source_row.email),
    strasse = coalesce(nullif(strasse, ''), source_row.strasse),
    plz = coalesce(nullif(plz, ''), source_row.plz),
    ort = coalesce(nullif(ort, ''), source_row.ort),
    land = coalesce(nullif(land, ''), source_row.land),
    versicherter_vorname = coalesce(nullif(versicherter_vorname, ''), source_row.versicherter_vorname),
    versicherter_nachname = coalesce(nullif(versicherter_nachname, ''), source_row.versicherter_nachname),
    versicherter_anrede = coalesce(nullif(versicherter_anrede, ''), source_row.versicherter_anrede),
    versicherter_geburtsdatum = coalesce(versicherter_geburtsdatum, source_row.versicherter_geburtsdatum),
    versicherter_strasse = coalesce(nullif(versicherter_strasse, ''), source_row.versicherter_strasse),
    versicherter_plz = coalesce(nullif(versicherter_plz, ''), source_row.versicherter_plz),
    versicherter_ort = coalesce(nullif(versicherter_ort, ''), source_row.versicherter_ort),
    versicherter_telefon = coalesce(nullif(versicherter_telefon, ''), source_row.versicherter_telefon),
    versicherter_email = coalesce(nullif(versicherter_email, ''), source_row.versicherter_email),
    eb2_vorname = coalesce(nullif(eb2_vorname, ''), source_row.eb2_vorname),
    eb2_nachname = coalesce(nullif(eb2_nachname, ''), source_row.eb2_nachname),
    eb2_anrede = coalesce(nullif(eb2_anrede, ''), source_row.eb2_anrede),
    eb2_telefon = coalesce(nullif(eb2_telefon, ''), source_row.eb2_telefon),
    eb2_email = coalesce(nullif(eb2_email, ''), source_row.eb2_email),
    krankenkasse = coalesce(nullif(krankenkasse, ''), source_row.krankenkasse),
    zusatzversicherung = coalesce(nullif(zusatzversicherung, ''), source_row.zusatzversicherung),
    versichertennummer = coalesce(nullif(versichertennummer, ''), source_row.versichertennummer),
    notizen = CASE
      WHEN nullif(trim(notizen), '') IS NULL THEN source_row.notizen
      WHEN nullif(trim(source_row.notizen), '') IS NULL THEN notizen
      WHEN position(source_row.notizen in notizen) > 0 THEN notizen
      ELSE notizen || E'\n' || source_row.notizen
    END
  WHERE id = p_target_patient_id;

  UPDATE user_profiles SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('user_profiles.patient_id', changed);
  UPDATE anamnese_submissions SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('anamnese_submissions.patient_id', changed);
  UPDATE anamnese_submissions SET matched_patient_id = p_target_patient_id WHERE matched_patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('anamnese_submissions.matched_patient_id', changed);
  UPDATE offene_posten SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('offene_posten.patient_id', changed);
  UPDATE raten SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('raten.patient_id', changed);
  UPDATE ratenplaene SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('ratenplaene.patient_id', changed);
  UPDATE transaktionen SET matched_patient_id = p_target_patient_id WHERE matched_patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('transaktionen.matched_patient_id', changed);
  UPDATE ki_analysen SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('ki_analysen.patient_id', changed);
  UPDATE behandlungsfall SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('behandlungsfall.patient_id', changed);
  UPDATE doku_eintraege SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('doku_eintraege.patient_id', changed);
  UPDATE patient_documents SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('patient_documents.patient_id', changed);
  UPDATE behandlungsphasen SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('behandlungsphasen.patient_id', changed);
  UPDATE patient_messages SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('patient_messages.patient_id', changed);
  UPDATE patient_notifications SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('patient_notifications.patient_id', changed);
  UPDATE push_subscriptions SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('push_subscriptions.patient_id', changed);
  UPDATE patient_engagement SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('patient_engagement.patient_id', changed);
  UPDATE patient_consents SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('patient_consents.patient_id', changed);
  UPDATE anima_balance_buchungen SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('anima_balance_buchungen.patient_id', changed);
  UPDATE mahnungen SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('mahnungen.patient_id', changed);
  UPDATE kassen_zahlungen SET patient_id = p_target_patient_id WHERE patient_id = p_source_patient_id;
  GET DIAGNOSTICS changed = ROW_COUNT; moved := moved || jsonb_build_object('kassen_zahlungen.patient_id', changed);

  UPDATE anamnese_submissions
  SET
    ivoris_patient_id = target_row.ivoris_id,
    ivoris_sync_error = NULL,
    ivoris_sync_failed_permanently = false,
    ivoris_doc_failed_permanently = false,
    ivoris_sync_retry_count = 0,
    ivoris_doc_retry_count = 0,
    ivoris_sync_next_retry_at = now(),
    ivoris_doc_next_retry_at = now()
  WHERE patient_id = p_target_patient_id OR matched_patient_id = p_target_patient_id;

  DELETE FROM patients WHERE id = p_source_patient_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'source patient could not be deleted'; END IF;

  INSERT INTO patient_merge_audit (
    source_patient_id,
    target_patient_id,
    reason,
    source_snapshot,
    target_snapshot_before,
    moved_references
  ) VALUES (
    p_source_patient_id,
    p_target_patient_id,
    trim(p_reason),
    source_snapshot,
    target_snapshot,
    moved
  );

  RETURN jsonb_build_object(
    'sourcePatientId', p_source_patient_id,
    'targetPatientId', p_target_patient_id,
    'movedReferences', moved
  );
END;
$$;

REVOKE ALL ON FUNCTION merge_patient_into_canonical(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_patient_into_canonical(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION merge_patient_into_canonical(uuid, uuid, text) TO service_role;
