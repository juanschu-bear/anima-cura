-- One canonical clinical record per patient and treatment day. Additional
-- rooms/appointments remain immutable parts. Position overlaps never block
-- clinical confirmation; they become accounting clarification cases.
BEGIN;

CREATE TABLE public.doku_tagesdatensaetze (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  service_date date NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  canonical_entry_id uuid NOT NULL UNIQUE REFERENCES public.doku_eintraege(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (patient_id, service_date)
);

CREATE TABLE public.doku_tagesdatensatz_teile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tagesdatensatz_id uuid NOT NULL REFERENCES public.doku_tagesdatensaetze(id),
  state text NOT NULL DEFAULT 'entwurf' CHECK (state IN ('entwurf','bestaetigt','verworfen')),
  kind text CHECK (kind IN ('original','nachtrag','korrektur')),
  corrects_part_id uuid REFERENCES public.doku_tagesdatensatz_teile(id),
  occurred_at timestamptz NOT NULL,
  documented_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  confirmed_at timestamptz,
  source_confirmed_at timestamptz,
  documented_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.user_profiles(id),
  confirmed_by uuid REFERENCES public.user_profiles(id),
  staff_initials text,
  room_version_id uuid REFERENCES public.scribe_room_versions(id),
  template_id uuid REFERENCES public.doku_vorlagen(id),
  treatment_type text,
  appointment_type text,
  text text NOT NULL CHECK (length(btrim(text)) BETWEEN 1 AND 50000),
  teeth jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(teeth)='array'),
  variables jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variables)='object'),
  selection jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(selection)='object'),
  positions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(positions)='array'),
  source_entry_id uuid REFERENCES public.doku_eintraege(id),
  source_entry_version integer CHECK (source_entry_version IS NULL OR source_entry_version > 0),
  source_ivoris_push_status text,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((state='bestaetigt')=(confirmed_at IS NOT NULL)),
  CHECK (kind<>'korrektur' OR corrects_part_id IS NOT NULL),
  UNIQUE (source_entry_id)
);

CREATE INDEX doku_day_parts_order_idx ON public.doku_tagesdatensatz_teile
  (tagesdatensatz_id, occurred_at, documented_at);

CREATE TABLE public.doku_positions_klaerfaelle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  tagesdatensatz_id uuid NOT NULL REFERENCES public.doku_tagesdatensaetze(id),
  day_version integer NOT NULL CHECK (day_version > 0),
  source_part_id uuid NOT NULL REFERENCES public.doku_tagesdatensatz_teile(id),
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','geloest','verworfen')),
  conflicts jsonb NOT NULL CHECK (jsonb_typeof(conflicts)='array' AND jsonb_array_length(conflicts)>0),
  accepted_positions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(accepted_positions)='array'),
  resolved_positions jsonb CHECK (resolved_positions IS NULL OR jsonb_typeof(resolved_positions)='array'),
  resolution jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.user_profiles(id),
  UNIQUE (tagesdatensatz_id, day_version, source_part_id)
);

ALTER TABLE public.doku_tagesdatensaetze ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doku_tagesdatensatz_teile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doku_positions_klaerfaelle ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.doku_tagesdatensaetze, public.doku_tagesdatensatz_teile,
  public.doku_positions_klaerfaelle FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.doku_tagesdatensaetze, public.doku_tagesdatensatz_teile TO authenticated;
GRANT SELECT ON public.doku_positions_klaerfaelle TO authenticated;

CREATE POLICY doku_day_read ON public.doku_tagesdatensaetze FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid()
  AND (p.role IN ('admin','verwaltung','lesezugriff') OR p.permissions->>'scribe_schreiben'='true')));
CREATE POLICY doku_day_create ON public.doku_tagesdatensaetze FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid()
  AND (p.role IN ('admin','verwaltung') OR p.permissions->>'scribe_schreiben'='true')));
CREATE POLICY doku_day_part_read ON public.doku_tagesdatensatz_teile FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid()
  AND (p.role IN ('admin','verwaltung','lesezugriff') OR p.permissions->>'scribe_schreiben'='true')));
CREATE POLICY doku_day_part_create ON public.doku_tagesdatensatz_teile FOR INSERT TO authenticated
WITH CHECK (documented_by=auth.uid() AND state='entwurf' AND staff_initials IS NULL
  AND confirmed_at IS NULL AND confirmed_by IS NULL AND source_entry_id IS NULL
  AND source_confirmed_at IS NULL AND source_ivoris_push_status IS NULL AND EXISTS (
  SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid()
  AND (p.role IN ('admin','verwaltung') OR p.permissions->>'scribe_schreiben'='true')));
CREATE POLICY doku_position_clarification_read ON public.doku_positions_klaerfaelle FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid()
  AND p.role IN ('admin','verwaltung','lesezugriff')));

CREATE OR REPLACE FUNCTION public.bootstrap_doku_day_record(
  p_entry_id uuid,
  p_expected_entry_version integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  entry_row public.doku_eintraege;
  day_id uuid;
  canonical boolean := false;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=actor_id
    AND (p.role IN ('admin','verwaltung') OR p.permissions->>'scribe_schreiben'='true')) THEN
    RAISE EXCEPTION 'scribe_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO entry_row FROM public.doku_eintraege WHERE id=p_entry_id FOR SHARE;
  IF NOT FOUND OR entry_row.status<>'bestaetigt' THEN
    RAISE EXCEPTION 'canonical_entry_not_confirmed' USING ERRCODE='55000';
  END IF;
  IF entry_row.version<>p_expected_entry_version THEN
    RAISE EXCEPTION 'entry_version_conflict' USING ERRCODE='40001';
  END IF;
  IF entry_row.patient_id IS NULL THEN
    RAISE EXCEPTION 'canonical_entry_patient_missing' USING ERRCODE='55000';
  END IF;
  SELECT id,canonical_entry_id=entry_row.id INTO day_id,canonical
  FROM public.doku_tagesdatensaetze
  WHERE patient_id=entry_row.patient_id AND service_date=entry_row.termin_datum
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.doku_tagesdatensaetze(patient_id,service_date,version,canonical_entry_id)
    VALUES(entry_row.patient_id,entry_row.termin_datum,1,entry_row.id)
    ON CONFLICT (patient_id,service_date) DO NOTHING
    RETURNING id,true INTO day_id,canonical;
    IF day_id IS NULL THEN
      SELECT id,canonical_entry_id=entry_row.id INTO day_id,canonical
      FROM public.doku_tagesdatensaetze
      WHERE patient_id=entry_row.patient_id AND service_date=entry_row.termin_datum
      FOR UPDATE;
    END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.doku_tagesdatensatz_teile WHERE source_entry_id=entry_row.id) THEN
    RETURN day_id;
  END IF;
  INSERT INTO public.doku_tagesdatensatz_teile(tagesdatensatz_id,state,kind,occurred_at,
    documented_at,confirmed_at,source_confirmed_at,documented_by,confirmed_by,staff_initials,room_version_id,
    template_id,treatment_type,appointment_type,text,teeth,variables,selection,positions,
    source_entry_id,source_entry_version,source_ivoris_push_status)
  VALUES(day_id,CASE WHEN canonical THEN 'bestaetigt' ELSE 'entwurf' END,
    CASE WHEN canonical THEN 'original' ELSE NULL END,
    coalesce(entry_row.created_at,entry_row.bestaetigt_am,entry_row.termin_datum::timestamp AT TIME ZONE 'Europe/Berlin'),
    coalesce(entry_row.created_at,entry_row.bestaetigt_am,entry_row.termin_datum::timestamp AT TIME ZONE 'Europe/Berlin'),
    CASE WHEN canonical THEN entry_row.bestaetigt_am ELSE NULL END,entry_row.bestaetigt_am,
    coalesce(entry_row.bestaetigt_von,actor_id),CASE WHEN canonical THEN entry_row.bestaetigt_von ELSE NULL END,
    entry_row.bestaetigt_kuerzel,
    entry_row.zimmer_version_id,entry_row.vorlage_id,entry_row.behandlungsart,entry_row.termin_typ,
    entry_row.text,to_jsonb(coalesce(entry_row.zaehne,ARRAY[]::text[])),coalesce(entry_row.variablen,'{}'::jsonb),
    coalesce(entry_row.auswahl,'{}'::jsonb),coalesce(entry_row.positionen,'[]'::jsonb),entry_row.id,entry_row.version,
    entry_row.ivoris_push_status);
  RETURN day_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decide_doku_day_part(
  p_day_id uuid,
  p_part_id uuid,
  p_expected_version integer,
  p_decision text,
  p_reason text,
  p_corrects_part_id uuid,
  p_resulting_text text,
  p_resulting_positions jsonb,
  p_conflicts jsonb,
  p_ivoris_delta_text text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $function$
DECLARE
  actor_id uuid := auth.uid();
  actor_initials text;
  day_row public.doku_tagesdatensaetze;
  part_row public.doku_tagesdatensatz_teile;
  entry_row public.doku_eintraege;
  new_version integer;
  clarification_id uuid;
  source_already_pushed boolean := false;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT upper(btrim(p.kuerzel)) INTO actor_initials FROM public.user_profiles p
  WHERE p.id=actor_id AND (p.role IN ('admin','verwaltung') OR p.permissions->>'scribe_schreiben'='true');
  IF actor_initials IS NULL OR actor_initials='' THEN RAISE EXCEPTION 'staff_initials_missing' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('nachtrag','korrektur','verwerfen') OR length(btrim(p_reason))<3 THEN
    RAISE EXCEPTION 'invalid_day_part_decision' USING ERRCODE='22023';
  END IF;

  SELECT * INTO day_row FROM public.doku_tagesdatensaetze WHERE id=p_day_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'day_record_not_found' USING ERRCODE='P0002'; END IF;
  IF day_row.version<>p_expected_version THEN RAISE EXCEPTION 'day_version_conflict' USING ERRCODE='40001'; END IF;
  SELECT * INTO part_row FROM public.doku_tagesdatensatz_teile
    WHERE id=p_part_id AND tagesdatensatz_id=p_day_id FOR UPDATE;
  IF NOT FOUND OR part_row.state<>'entwurf' THEN RAISE EXCEPTION 'draft_part_not_found' USING ERRCODE='P0002'; END IF;

  IF p_decision='verwerfen' THEN
    UPDATE public.doku_tagesdatensatz_teile SET state='verworfen',kind=NULL,corrects_part_id=NULL,
      decision_reason=btrim(p_reason),updated_at=clock_timestamp() WHERE id=p_part_id;
    UPDATE public.doku_tagesdatensaetze SET version=version+1,updated_at=clock_timestamp() WHERE id=p_day_id;
    RETURN jsonb_build_object('dayRecordId',p_day_id,'partId',p_part_id,'state','verworfen',
      'version',p_expected_version+1,'ivoris',jsonb_build_object('action','none'));
  END IF;

  IF p_decision='korrektur' AND (p_corrects_part_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.doku_tagesdatensatz_teile p WHERE p.id=p_corrects_part_id
      AND p.tagesdatensatz_id=p_day_id AND p.state='bestaetigt')) THEN
    RAISE EXCEPTION 'corrected_part_not_found' USING ERRCODE='22023';
  END IF;
  IF p_resulting_text IS NULL OR p_ivoris_delta_text IS NULL OR jsonb_typeof(p_resulting_positions)<>'array'
    OR jsonb_typeof(p_conflicts)<>'array' THEN
    RAISE EXCEPTION 'invalid_day_result' USING ERRCODE='22023';
  END IF;

  SELECT * INTO entry_row FROM public.doku_eintraege WHERE id=day_row.canonical_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'canonical_entry_not_found' USING ERRCODE='P0002'; END IF;
  source_already_pushed := part_row.source_entry_id IS NOT NULL
    AND part_row.source_entry_id<>day_row.canonical_entry_id
    AND EXISTS(SELECT 1 FROM public.doku_eintraege source_entry
      WHERE source_entry.id=part_row.source_entry_id AND source_entry.ivoris_push_status='gepusht');
  new_version := entry_row.version+1;

  UPDATE public.doku_tagesdatensatz_teile SET state='bestaetigt',kind=p_decision,
    corrects_part_id=CASE WHEN p_decision='korrektur' THEN p_corrects_part_id ELSE NULL END,
    confirmed_at=clock_timestamp(),confirmed_by=actor_id,staff_initials=actor_initials,
    decision_reason=btrim(p_reason),updated_at=clock_timestamp() WHERE id=p_part_id;

  UPDATE public.doku_eintraege SET text=p_resulting_text,positionen=p_resulting_positions,
    version=new_version,status='bestaetigt',bestaetigt_von=actor_id,bestaetigt_kuerzel=actor_initials,
    bestaetigt_am=clock_timestamp(),
    ivoris_push_status=CASE WHEN source_already_pushed THEN ivoris_push_status ELSE 'ausstehend' END,
    ivoris_entry_id=CASE WHEN source_already_pushed THEN ivoris_entry_id ELSE NULL END,
    ivoris_fehler=CASE WHEN source_already_pushed THEN ivoris_fehler ELSE NULL END,
    ivoris_retry_count=CASE WHEN source_already_pushed THEN ivoris_retry_count ELSE 0 END,
    ivoris_next_retry_at=CASE WHEN source_already_pushed THEN ivoris_next_retry_at ELSE NULL END,
    ivoris_error_class=CASE WHEN source_already_pushed THEN ivoris_error_class ELSE NULL END,
    variablen=CASE WHEN source_already_pushed THEN variablen ELSE
      jsonb_set(coalesce(variablen,'{}'::jsonb),'{_dayDelta}',jsonb_build_object(
        'kind',p_decision,'text',p_ivoris_delta_text,'sourcePartId',p_part_id),true) END
  WHERE id=entry_row.id;

  INSERT INTO public.doku_eintrag_versionen(eintrag_id,version,text,zaehne,variablen,auswahl,
    positionen,ausnahme_freitext,aenderungsgrund,erstellt_von)
  SELECT id,version,text,zaehne,variablen,auswahl,positionen,ausnahme_freitext,
    upper(p_decision)||': '||btrim(p_reason),actor_id FROM public.doku_eintraege WHERE id=entry_row.id;

  UPDATE public.doku_tagesdatensaetze SET version=version+1,updated_at=clock_timestamp() WHERE id=p_day_id;
  IF jsonb_array_length(p_conflicts)>0 THEN
    INSERT INTO public.doku_positions_klaerfaelle(patient_id,tagesdatensatz_id,day_version,
      source_part_id,conflicts,accepted_positions)
    VALUES(day_row.patient_id,p_day_id,p_expected_version+1,p_part_id,p_conflicts,p_resulting_positions)
    RETURNING id INTO clarification_id;
  END IF;

  RETURN jsonb_build_object('dayRecordId',p_day_id,'partId',p_part_id,'state','bestaetigt',
    'kind',p_decision,'version',p_expected_version+1,'entryVersion',new_version,
    'clarificationId',clarification_id,
    'ivoris',jsonb_build_object('action',CASE WHEN source_already_pushed THEN 'already_pushed'
      WHEN p_decision='korrektur' THEN 'append_korrektur' ELSE 'append_nachtrag' END));
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_doku_position_clarification(
  p_clarification_id uuid,
  p_expected_revision integer,
  p_actor_id uuid,
  p_resolutions jsonb,
  p_resolved_positions jsonb,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $function$
DECLARE
  case_row public.doku_positions_klaerfaelle;
  day_row public.doku_tagesdatensaetze;
  entry_row public.doku_eintraege;
  new_version integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles p WHERE p.id=p_actor_id AND p.role IN ('admin','verwaltung')) THEN
    RAISE EXCEPTION 'clarification_forbidden' USING ERRCODE='42501';
  END IF;
  IF length(btrim(p_reason))<3 OR jsonb_typeof(p_resolutions)<>'array'
    OR jsonb_typeof(p_resolved_positions)<>'array' THEN
    RAISE EXCEPTION 'invalid_clarification_resolution' USING ERRCODE='22023';
  END IF;
  SELECT * INTO case_row FROM public.doku_positions_klaerfaelle WHERE id=p_clarification_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'clarification_not_found' USING ERRCODE='P0002'; END IF;
  IF case_row.status<>'offen' OR case_row.revision<>p_expected_revision THEN
    RAISE EXCEPTION 'object_revision_conflict' USING ERRCODE='40001';
  END IF;
  SELECT * INTO day_row FROM public.doku_tagesdatensaetze WHERE id=case_row.tagesdatensatz_id FOR UPDATE;
  SELECT * INTO entry_row FROM public.doku_eintraege WHERE id=day_row.canonical_entry_id FOR UPDATE;
  IF entry_row.ivoris_push_status<>'gepusht' THEN
    RAISE EXCEPTION 'clinical_delta_not_pushed' USING ERRCODE='55000';
  END IF;
  new_version := entry_row.version+1;
  UPDATE public.doku_positions_klaerfaelle SET status='geloest',revision=revision+1,
    resolution=p_resolutions,resolved_positions=p_resolved_positions,
    resolved_at=clock_timestamp(),resolved_by=p_actor_id WHERE id=p_clarification_id;
  UPDATE public.doku_eintraege SET positionen=positionen||p_resolved_positions,
    version=new_version WHERE id=entry_row.id;
  INSERT INTO public.doku_eintrag_versionen(eintrag_id,version,text,zaehne,variablen,auswahl,
    positionen,ausnahme_freitext,aenderungsgrund,erstellt_von)
  SELECT id,version,text,zaehne,variablen,auswahl,positionen,ausnahme_freitext,
    'ABRECHNUNGSKLÄRUNG: '||btrim(p_reason),p_actor_id FROM public.doku_eintraege WHERE id=entry_row.id;
  UPDATE public.doku_tagesdatensaetze SET version=version+1,updated_at=clock_timestamp() WHERE id=day_row.id;
  RETURN jsonb_build_object('clarificationId',p_clarification_id,'revision',p_expected_revision+1,
    'dayRecordId',day_row.id,'dayVersion',day_row.version+1,'entryVersion',new_version,'state','geloest');
END;
$function$;

REVOKE ALL ON FUNCTION public.decide_doku_day_part(uuid,uuid,integer,text,text,uuid,text,jsonb,jsonb,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.decide_doku_day_part(uuid,uuid,integer,text,text,uuid,text,jsonb,jsonb,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_doku_day_record(uuid,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_doku_day_record(uuid,integer) TO authenticated;

REVOKE ALL ON FUNCTION public.resolve_doku_position_clarification(uuid,integer,uuid,jsonb,jsonb,text)
  FROM PUBLIC,anon,authenticated,service_role;
DO $grant$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='abrechnung_runtime') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.resolve_doku_position_clarification(uuid,integer,uuid,jsonb,jsonb,text) TO abrechnung_runtime';
  END IF;
END
$grant$;

COMMIT;
