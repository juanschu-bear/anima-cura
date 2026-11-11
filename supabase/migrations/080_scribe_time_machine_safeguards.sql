-- 11.11.2026: isolate malformed templates, protect seed indices and suppress self-notifications.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.scribe_seed_option_layout(p_structure jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_object_agg(group_name,coalesce(group_value->'opts','[]'::jsonb)),'{}'::jsonb)
 FROM jsonb_each(coalesce(p_structure->'groups','{}'::jsonb)) AS groups(group_name,group_value)
$$;

CREATE OR REPLACE FUNCTION public.scribe_protect_seed_option_layout() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF public.scribe_seed_option_layout(NEW.struktur) IS DISTINCT FROM public.scribe_seed_option_layout(OLD.struktur) THEN
  RAISE EXCEPTION 'template_structure_change_requires_history';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS scribe_protect_seed_option_layout ON public.doku_vorlagen;
CREATE TRIGGER scribe_protect_seed_option_layout
 BEFORE UPDATE OF struktur ON public.doku_vorlagen FOR EACH ROW
 EXECUTE FUNCTION public.scribe_protect_seed_option_layout();

-- Same atomic inbox contract as 078. The only behavioral change is that the
-- actor never receives a bell for their own status event or comment.
CREATE OR REPLACE FUNCTION public.scribe_inbox_commit(p_entry jsonb,p_expected bigint,p_actor uuid,p_developer boolean,p_delete boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE oldrow record; prof record; eid uuid:=(p_entry->>'id')::uuid; e jsonb; c jsonb; n int; prev text; next text:=p_entry->>'status'; newrev bigint;
BEGIN
 IF p_actor IS NOT NULL THEN
  SELECT * INTO prof FROM public.user_profiles WHERE id=p_actor;
  IF prof.id IS NULL OR prof.role NOT IN ('admin','verwaltung','lesezugriff') OR prof.patient_id IS NOT NULL THEN RAISE EXCEPTION 'practice_forbidden'; END IF;
 ELSIF NOT p_developer THEN RAISE EXCEPTION 'practice_forbidden'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(eid::text,0));
 SELECT * INTO oldrow FROM public.scribe_inbox_entries WHERE id=eid FOR UPDATE;
 IF FOUND THEN
  IF oldrow.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'inbox_not_found'; END IF;
  IF oldrow.revision<>p_expected THEN RAISE EXCEPTION 'inbox_revision_stale'; END IF;
  IF p_delete THEN
   IF oldrow.created_by IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'inbox_delete_forbidden'; END IF;
   UPDATE public.scribe_inbox_entries SET deleted_at=clock_timestamp(),revision=revision+1 WHERE id=eid;
   RETURN jsonb_build_object('ok',true);
  END IF;
  prev:=oldrow.payload->>'status';
  IF next IS DISTINCT FROM prev AND NOT p_developer AND next<>'praxis_bestaetigt' THEN RAISE EXCEPTION 'inbox_developer_required'; END IF;
  IF next='praxis_bestaetigt' AND next IS DISTINCT FROM prev AND prev<>'bereitgestellt' THEN RAISE EXCEPTION 'inbox_not_ready'; END IF;
  IF oldrow.created_by IS DISTINCT FROM (p_entry->>'erstellt_von')::uuid THEN RAISE EXCEPTION 'input_invalid'; END IF;
  UPDATE public.scribe_inbox_entries SET payload=p_entry-'kommentare'-'status_verlauf',revision=revision+1 WHERE id=eid RETURNING revision INTO newrev;
 ELSE
  IF p_expected<>0 OR p_delete THEN RAISE EXCEPTION 'inbox_not_found'; END IF;
  IF next<>'bestaetigt' OR p_actor IS DISTINCT FROM (p_entry->>'erstellt_von')::uuid THEN RAISE EXCEPTION 'input_invalid'; END IF;
  INSERT INTO public.scribe_inbox_entries(id,payload,created_by,created_at) VALUES(eid,p_entry-'kommentare'-'status_verlauf',p_actor,(p_entry->>'erstellt_am')::timestamptz);
  INSERT INTO public.scribe_inbox_mail_jobs(entry_id) VALUES(eid);
  newrev:=1;
 END IF;
 n:=0;
 FOR e IN SELECT value FROM jsonb_array_elements(p_entry->'status_verlauf') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.scribe_inbox_events WHERE entry_id=eid AND ordinal=n) THEN
   INSERT INTO public.scribe_inbox_events VALUES(eid,n,e);
   IF oldrow.id IS NOT NULL AND oldrow.created_by IS NOT NULL AND oldrow.created_by IS DISTINCT FROM p_actor THEN
    INSERT INTO public.practice_notifications(recipient_id,kind,title,body,link,source_key)
     VALUES(oldrow.created_by,'wunsch_status','Neuer Stand zu deinem Eintrag',e->>'zu','/scribe?inbox='||eid,'inbox:'||eid||':status:'||n);
   END IF;
  ELSIF (SELECT payload FROM public.scribe_inbox_events WHERE entry_id=eid AND ordinal=n)<>e THEN RAISE EXCEPTION 'scribe_history_immutable'; END IF;
  n:=n+1;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(p_entry->'kommentare') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.scribe_inbox_comments WHERE id=(c->>'id')::uuid) THEN
   INSERT INTO public.scribe_inbox_comments VALUES((c->>'id')::uuid,eid,c);
   IF (p_entry->>'erstellt_von') IS NOT NULL AND (p_entry->>'erstellt_von')::uuid IS DISTINCT FROM p_actor THEN
    INSERT INTO public.practice_notifications(recipient_id,kind,title,body,link,source_key)
     VALUES((p_entry->>'erstellt_von')::uuid,'antwort','Neue Antwort auf deinen Eintrag',left(c->>'text',300),'/scribe?inbox='||eid,'inbox:comment:'||(c->>'id'));
   END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM public.scribe_inbox_comments WHERE id=(c->>'id')::uuid AND (entry_id<>eid OR payload-'gelesen_von'<>c-'gelesen_von')) THEN RAISE EXCEPTION 'scribe_history_immutable'; END IF;
   UPDATE public.scribe_inbox_comments SET payload=c WHERE id=(c->>'id')::uuid AND entry_id=eid;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'revision',newrev);
END $$;

REVOKE ALL ON FUNCTION public.scribe_seed_option_layout(jsonb),public.scribe_protect_seed_option_layout(),public.scribe_inbox_commit(jsonb,bigint,uuid,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scribe_inbox_commit(jsonb,bigint,uuid,boolean,boolean) TO service_role;

COMMIT;
