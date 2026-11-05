-- Requires 075. New guards only; historical duplicate entries remain untouched.
BEGIN;
CREATE TABLE public.doku_confirmed_day_guards (
 patient_id uuid NOT NULL,
 service_date date NOT NULL,
 entry_id uuid NOT NULL REFERENCES public.doku_eintraege(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
 PRIMARY KEY(patient_id,service_date)
);
ALTER TABLE public.doku_confirmed_day_guards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.doku_confirmed_day_guards FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.guard_scribe_confirmed_day() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE existing_id uuid; old_key bigint; new_key bigint; lock_key bigint;
BEGIN
 IF TG_OP='UPDATE' AND (OLD.status,OLD.patient_id,OLD.termin_datum)
  IS NOT DISTINCT FROM (NEW.status,NEW.patient_id,NEW.termin_datum) THEN RETURN NEW; END IF;
 IF TG_OP<>'INSERT' AND OLD.status='bestaetigt' AND OLD.patient_id IS NOT NULL THEN
  old_key:=hashtextextended(OLD.patient_id::text||':'||OLD.termin_datum::text,76);
 END IF;
 IF TG_OP<>'DELETE' AND NEW.status='bestaetigt' AND NEW.patient_id IS NOT NULL THEN
  new_key:=hashtextextended(NEW.patient_id::text||':'||NEW.termin_datum::text,76);
 END IF;
 -- Lock both days in a stable order, including releases and deletes.
 FOR lock_key IN SELECT DISTINCT k FROM unnest(ARRAY[old_key,new_key]) k WHERE k IS NOT NULL ORDER BY k LOOP
  PERFORM pg_advisory_xact_lock(lock_key);
 END LOOP;
 IF TG_OP<>'INSERT' THEN
  DELETE FROM public.doku_confirmed_day_guards WHERE entry_id=OLD.id;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.status IS DISTINCT FROM 'bestaetigt' OR NEW.patient_id IS NULL THEN RETURN NEW; END IF;
 -- Release and acquisition roll back together if the destination is occupied.
 SELECT e.id INTO existing_id FROM public.doku_eintraege e
 WHERE e.patient_id=NEW.patient_id AND e.termin_datum=NEW.termin_datum AND e.status='bestaetigt' AND e.id<>NEW.id
 ORDER BY e.created_at,e.id LIMIT 1;
 IF existing_id IS NOT NULL THEN
  RAISE EXCEPTION 'day_record_exists' USING ERRCODE='P0001',DETAIL=jsonb_build_object('entryId',existing_id)::text;
 END IF;
 -- The unique reservation also prevents duplicates with repeatable-read snapshots.
 INSERT INTO public.doku_confirmed_day_guards(patient_id,service_date,entry_id)
 VALUES(NEW.patient_id,NEW.termin_datum,NEW.id)
 ON CONFLICT(patient_id,service_date) DO UPDATE SET entry_id=doku_confirmed_day_guards.entry_id
 RETURNING entry_id INTO existing_id;
 IF existing_id<>NEW.id THEN RAISE EXCEPTION 'day_record_exists' USING ERRCODE='P0001',DETAIL=jsonb_build_object('entryId',existing_id)::text; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_scribe_confirmed_day BEFORE INSERT OR UPDATE OR DELETE ON public.doku_eintraege
 FOR EACH ROW EXECUTE FUNCTION public.guard_scribe_confirmed_day();

CREATE FUNCTION public.guard_scribe_canonical_content() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF (NEW.text,NEW.positionen,NEW.zaehne,NEW.variablen,NEW.auswahl,NEW.version,NEW.status,NEW.patient_id,NEW.termin_datum)
 IS NOT DISTINCT FROM (OLD.text,OLD.positionen,OLD.zaehne,OLD.variablen,OLD.auswahl,OLD.version,OLD.status,OLD.patient_id,OLD.termin_datum) THEN RETURN NEW; END IF;
 -- Only the owners of the explicitly authorized SECURITY DEFINER day commands
 -- can update canonical content. A caller-supplied flag cannot bypass this guard.
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('decide_doku_day_part','resolve_doku_position_clarification')
   AND p.prosecdef AND pg_get_userbyid(p.proowner)=current_user) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.doku_tagesdatensaetze d WHERE d.canonical_entry_id=OLD.id) THEN
  RAISE EXCEPTION 'day_record_correction_required' USING ERRCODE='P0001';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_scribe_canonical_content BEFORE UPDATE ON public.doku_eintraege
 FOR EACH ROW EXECUTE FUNCTION public.guard_scribe_canonical_content();
REVOKE ALL ON FUNCTION public.guard_scribe_confirmed_day(),public.guard_scribe_canonical_content() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
