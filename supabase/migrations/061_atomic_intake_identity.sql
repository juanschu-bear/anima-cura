-- Additive intake resolver. No historical backfill, merge, portal grant or patient update.
BEGIN;
CREATE FUNCTION resolve_intake_identity(p_submission_id uuid, p_allow_create boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  s record; hit record; first_name text; last_name text; birthday date;
  exact_ids uuid[]; related_ids uuid[]; candidate_ids uuid[]; result_id uuid;
  insurance text; visit_reason text; is_new boolean := false; origin_note text; swapped boolean := false;
BEGIN
  -- Serializes even older INSERT writers, then rechecks identity under the same lock.
  -- No network work happens while locked. Swapped names cannot create parallel records.
  SET LOCAL lock_timeout = '5s';
  LOCK TABLE patients IN SHARE ROW EXCLUSIVE MODE;
  SELECT id,vorname,nachname,geburtsdatum,patient_id,matched_patient_id,ivoris_patient_id,answers,email
    INTO s FROM anamnese_submissions WHERE id=p_submission_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','lookup_failed','reason','submission_missing'); END IF;
  first_name := lower(regexp_replace(trim(normalize(s.vorname,NFC)),'\s+',' ','g'));
  last_name := lower(regexp_replace(trim(normalize(s.nachname,NFC)),'\s+',' ','g'));
  IF coalesce(first_name,'')='' OR coalesce(last_name,'')='' OR s.geburtsdatum IS NULL THEN
    RETURN jsonb_build_object('status','possible_duplicate','reason','missing_identity');
  END IF;
  BEGIN birthday := s.geburtsdatum::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RETURN jsonb_build_object('status','possible_duplicate','reason','invalid_birthdate');
  END;
  IF birthday < '1900-01-01'::date OR birthday > (now() AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN jsonb_build_object('status','possible_duplicate','reason','invalid_birthdate');
  END IF;
  SELECT array_agg(p.id) FILTER (WHERE p.geburtsdatum=birthday AND
      ((lower(regexp_replace(trim(normalize(p.vorname,NFC)),'\s+',' ','g'))=first_name AND lower(regexp_replace(trim(normalize(p.nachname,NFC)),'\s+',' ','g'))=last_name)
       OR (lower(regexp_replace(trim(normalize(p.vorname,NFC)),'\s+',' ','g'))=last_name AND lower(regexp_replace(trim(normalize(p.nachname,NFC)),'\s+',' ','g'))=first_name))),
    array_agg(p.id) FILTER (WHERE
      (treatment_name_keys(p.vorname) && treatment_name_keys(s.vorname) AND treatment_name_keys(p.nachname) && treatment_name_keys(s.nachname)) OR
      (treatment_name_keys(p.vorname) && treatment_name_keys(s.nachname) AND treatment_name_keys(p.nachname) && treatment_name_keys(s.vorname))),
    array_agg(p.id)
  INTO exact_ids,related_ids,candidate_ids
  FROM treatment_identity_candidates(s.vorname,s.nachname,birthday,s.patient_id,s.ivoris_patient_id) p;
  IF coalesce(cardinality(exact_ids),0)=1 AND coalesce(cardinality(related_ids),0)=1 THEN
    result_id := exact_ids[1];
    SELECT * INTO hit FROM patients WHERE id=result_id;
    swapped := first_name=lower(regexp_replace(trim(normalize(hit.nachname,NFC)),'\s+',' ','g')) AND first_name<>last_name;
    IF (s.patient_id IS NOT NULL AND s.patient_id<>result_id)
      OR (s.matched_patient_id IS NOT NULL AND s.matched_patient_id<>result_id)
      OR (s.ivoris_patient_id IS NOT NULL AND s.ivoris_patient_id IS DISTINCT FROM hit.ivoris_id) THEN
      RETURN jsonb_build_object('status','possible_duplicate','reason','stable_id_conflict');
    END IF;
    is_new := hit.notizen = 'AnimaSign:new:' || s.id::text;
  ELSIF coalesce(cardinality(related_ids),0)>0 OR s.patient_id IS NOT NULL OR s.matched_patient_id IS NOT NULL OR s.ivoris_patient_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','possible_duplicate','reason','identity_conflict');
  ELSE
    IF NOT p_allow_create THEN RETURN jsonb_build_object('status','new_candidate','reason','complete_search_no_match'); END IF;
    insurance := lower(trim(s.answers->>'versicherungsart'));
    insurance := CASE WHEN insurance IN ('gesetzlich','gkv') THEN 'gesetzlich'
      WHEN insurance IN ('privat','pkv','beihilfe','selbstzahler') THEN 'privat' ELSE NULL END;
    visit_reason := nullif(trim(s.answers->>'besuchsgrund'),'');
    IF insurance IS NULL OR visit_reason IS NULL THEN
      RETURN jsonb_build_object('status','possible_duplicate','reason','missing_creation_facts');
    END IF;
    origin_note := 'AnimaSign:new:' || s.id::text;
    INSERT INTO patients(vorname,nachname,geburtsdatum,geschlecht,kasse,email,behandlung,behandlung_start,behandlung_status,notizen)
      VALUES(trim(s.vorname),trim(s.nachname),birthday,
        CASE lower(s.answers->>'patient_geschlecht') WHEN 'm' THEN 'm' WHEN 'w' THEN 'w' WHEN 'd' THEN 'd' ELSE NULL END,
        insurance,s.email,visit_reason,NULL,NULL,origin_note)
      RETURNING id INTO result_id;
    is_new := true;
  END IF;
  UPDATE anamnese_submissions SET patient_id=result_id,matched_patient_id=result_id,is_existing=NOT coalesce(is_new,false)
    WHERE id=s.id;
  RETURN jsonb_build_object('status','matched','reason','atomic_identity_resolution','patient_id',result_id,'is_new',coalesce(is_new,false),
    'swapped',swapped);
END $$;
REVOKE ALL ON FUNCTION resolve_intake_identity(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION resolve_intake_identity(uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
