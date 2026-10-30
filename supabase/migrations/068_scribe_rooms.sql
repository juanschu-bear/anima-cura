-- New entries require a room; old entries and historical versions stay untouched.
BEGIN;
CREATE TABLE public.scribe_room_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (room_id, version)
);
INSERT INTO public.scribe_room_versions (room_id, version, name)
SELECT gen_random_uuid(), 1, 'Zimmer ' || n FROM generate_series(1,3) n;
ALTER TABLE public.scribe_room_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scribe_room_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.scribe_room_versions TO authenticated, service_role;
CREATE POLICY scribe_rooms_read ON public.scribe_room_versions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid()
  AND (p.role IN ('admin','verwaltung') OR p.permissions->>'scribe_schreiben' = 'true')));
CREATE POLICY scribe_rooms_manage ON public.scribe_room_versions FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

ALTER TABLE public.doku_eintraege ADD COLUMN zimmer_version_id uuid REFERENCES public.scribe_room_versions(id);
ALTER TABLE public.doku_eintrag_versionen ADD COLUMN zimmer_version_id uuid REFERENCES public.scribe_room_versions(id);

CREATE FUNCTION public.scribe_room_catalog_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE previous_version integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Room versions are immutable' USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.room_id::text, 68));
  SELECT max(version) INTO previous_version FROM public.scribe_room_versions WHERE room_id = NEW.room_id;
  IF NEW.version <> coalesce(previous_version,0) + 1 THEN
    RAISE EXCEPTION 'Room list changed; reload before saving' USING ERRCODE = '40001';
  END IF;
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $$;
CREATE TRIGGER scribe_room_catalog_guard BEFORE INSERT OR UPDATE OR DELETE ON public.scribe_room_versions
FOR EACH ROW EXECUTE FUNCTION public.scribe_room_catalog_guard();

CREATE FUNCTION public.scribe_entry_room_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE selected_room public.scribe_room_versions;
BEGIN
  -- Unchanged legacy NULL and unchanged historical room versions remain valid.
  IF TG_OP = 'UPDATE' AND NEW.zimmer_version_id IS NOT DISTINCT FROM OLD.zimmer_version_id THEN RETURN NEW; END IF;
  IF NEW.zimmer_version_id IS NULL THEN RAISE EXCEPTION 'Bitte ein Zimmer auswählen.' USING ERRCODE = '23514'; END IF;
  SELECT * INTO selected_room FROM public.scribe_room_versions WHERE id = NEW.zimmer_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Zimmer nicht gefunden.' USING ERRCODE = '23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(selected_room.room_id::text, 68));
  IF NOT selected_room.active OR EXISTS (SELECT 1 FROM public.scribe_room_versions WHERE room_id = selected_room.room_id AND version > selected_room.version) THEN
    RAISE EXCEPTION 'Zimmerliste geändert. Bitte erneut auswählen.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'entwurf' AND NEW.version <= OLD.version THEN
    RAISE EXCEPTION 'Zimmeränderung benötigt eine neue Eintragsversion.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scribe_entry_room_guard BEFORE INSERT OR UPDATE ON public.doku_eintraege
FOR EACH ROW EXECUTE FUNCTION public.scribe_entry_room_guard();

CREATE FUNCTION public.scribe_history_room_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_entry public.doku_eintraege;
BEGIN
  SELECT * INTO current_entry FROM public.doku_eintraege WHERE id = NEW.eintrag_id FOR SHARE;
  IF NOT FOUND OR NEW.version <> current_entry.version THEN
    RAISE EXCEPTION 'Eintrag inzwischen geändert. Historie nicht übernommen.' USING ERRCODE = '40001';
  END IF;
  NEW.zimmer_version_id := current_entry.zimmer_version_id;
  RETURN NEW;
END $$;
CREATE TRIGGER scribe_history_room_guard BEFORE INSERT ON public.doku_eintrag_versionen
FOR EACH ROW EXECUTE FUNCTION public.scribe_history_room_guard();
REVOKE ALL ON FUNCTION public.scribe_room_catalog_guard(), public.scribe_entry_room_guard(), public.scribe_history_room_guard() FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
