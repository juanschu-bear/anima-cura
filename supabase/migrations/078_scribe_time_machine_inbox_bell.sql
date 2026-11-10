-- 10.11.2026: append-only template history, relational inbox, shared practice bell.
-- Run only after explicit approval. Preserves the legacy inbox as migration backup.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE public.scribe_option_slots (
 option_key text PRIMARY KEY, template_id uuid NOT NULL REFERENCES public.doku_vorlagen(id),
 praxis_id text NOT NULL, gruppe text NOT NULL, option_index int NOT NULL CHECK(option_index>=0),
 source text NOT NULL CHECK(source IN ('vorlage','praxis')), practice_option_id uuid,
 baseline jsonb NOT NULL, state jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 last_change_id uuid, UNIQUE(template_id,praxis_id,gruppe,option_index)
);
CREATE TABLE public.scribe_template_commands (
 request_id uuid PRIMARY KEY, actor_id uuid NOT NULL, request jsonb NOT NULL, result jsonb NOT NULL
);
CREATE TABLE public.scribe_option_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 template_id uuid NOT NULL REFERENCES public.doku_vorlagen(id), praxis_id text NOT NULL,
 behandlungsart text NOT NULL, termin_typ text NOT NULL, gruppe text NOT NULL,
 option_key text NOT NULL REFERENCES public.scribe_option_slots(option_key),
 action text NOT NULL CHECK(action IN ('hide','show','rename','restore_practice','undo','restore_at')),
 before_state jsonb NOT NULL, after_state jsonb NOT NULL,
 actor_id uuid NOT NULL, actor_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 reverses_id uuid REFERENCES public.scribe_option_changes(id), request_id uuid NOT NULL
);
CREATE INDEX ON public.scribe_option_changes(template_id,praxis_id,seq);
CREATE FUNCTION public.scribe_immutable_history() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'scribe_history_immutable'; END $$;
CREATE TRIGGER scribe_option_history_immutable BEFORE UPDATE OR DELETE ON public.scribe_option_changes
 FOR EACH ROW EXECUTE FUNCTION public.scribe_immutable_history();

-- Seed positions keep their existing array indices. Active practice texts keep today's
-- order; previously deleted texts receive slots AFTER these, so restoring never shifts them.
CREATE FUNCTION public.scribe_register_slots(p_template uuid,p_practice text) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v record; g record; o record; i int; n int; k text; s jsonb;
BEGIN
 SELECT * INTO STRICT v FROM public.doku_vorlagen WHERE id=p_template FOR UPDATE;
 FOR g IN SELECT * FROM jsonb_each(v.struktur->'groups') LOOP
  i:=0;
  FOR o IN SELECT value FROM jsonb_array_elements(g.value->'opts') LOOP
   k:=p_template::text||':'||p_practice||':'||g.key||':seed:'||i;
   IF EXISTS(SELECT 1 FROM public.scribe_option_slots WHERE template_id=p_template AND praxis_id=p_practice
      AND gruppe=g.key AND option_index=i AND option_key<>k) THEN RAISE EXCEPTION 'template_layout_changed'; END IF;
   s:=jsonb_build_object('text',o.value->>'t','hidden',false);
   INSERT INTO public.scribe_option_slots(option_key,template_id,praxis_id,gruppe,option_index,source,baseline,state)
     VALUES(k,p_template,p_practice,g.key,i,'vorlage',s,s) ON CONFLICT(option_key) DO NOTHING;
   IF EXISTS(SELECT 1 FROM public.scribe_option_slots WHERE option_key=k AND baseline->>'text' IS DISTINCT FROM o.value->>'t')
    THEN RAISE EXCEPTION 'template_layout_changed'; END IF;
   i:=i+1;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.scribe_option_slots WHERE template_id=p_template AND praxis_id=p_practice
    AND gruppe=g.key AND source='vorlage' AND option_index>=i) THEN RAISE EXCEPTION 'template_layout_changed'; END IF;
  SELECT coalesce(max(option_index)+1,i) INTO n FROM public.scribe_option_slots WHERE template_id=p_template AND praxis_id=p_practice AND gruppe=g.key;
  FOR o IN SELECT * FROM public.doku_vorlagen_optionen WHERE praxis_id=p_practice AND behandlungsart=v.behandlungsart
    AND termin_typ=v.termin_typ AND gruppe=g.key ORDER BY aktiv DESC,sort_index,created_at,id LOOP
   k:='practice:'||o.id;
   IF NOT EXISTS(SELECT 1 FROM public.scribe_option_slots WHERE option_key=k) THEN
    s:=jsonb_build_object('text',o.text,'hidden',NOT o.aktiv);
    INSERT INTO public.scribe_option_slots(option_key,template_id,praxis_id,gruppe,option_index,source,practice_option_id,baseline,state)
     VALUES(k,p_template,p_practice,g.key,n,'praxis',o.id,s,s);
    n:=n+1;
   END IF;
  END LOOP;
 END LOOP;
END $$;
DO $$ DECLARE v record; p text; BEGIN
 FOR v IN SELECT id FROM public.doku_vorlagen ORDER BY id LOOP
  FOR p IN SELECT 'praxis-schubert' UNION SELECT DISTINCT praxis_id FROM public.doku_vorlagen_optionen LOOP
   PERFORM public.scribe_register_slots(v.id,p);
  END LOOP;
 END LOOP;
END $$;
CREATE FUNCTION public.scribe_register_new_option() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t uuid; BEGIN
 SELECT id INTO t FROM public.doku_vorlagen WHERE behandlungsart=NEW.behandlungsart AND termin_typ=NEW.termin_typ AND aktiv=true;
 IF t IS NOT NULL THEN PERFORM public.scribe_register_slots(t,NEW.praxis_id); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scribe_register_new_option AFTER INSERT ON public.doku_vorlagen_optionen
 FOR EACH ROW EXECUTE FUNCTION public.scribe_register_new_option();
CREATE FUNCTION public.scribe_register_new_template() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p text; BEGIN
 FOR p IN SELECT 'praxis-schubert' UNION SELECT DISTINCT praxis_id FROM public.doku_vorlagen_optionen LOOP
  PERFORM public.scribe_register_slots(NEW.id,p);
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER scribe_register_new_template AFTER INSERT ON public.doku_vorlagen FOR EACH ROW EXECUTE FUNCTION public.scribe_register_new_template();
REVOKE ALL ON FUNCTION public.scribe_register_new_template() FROM PUBLIC,anon,authenticated;
-- Direct authenticated mutations could bypass the house rule and history.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.doku_vorlagen_optionen,public.doku_vorlagen FROM anon,authenticated;

CREATE FUNCTION public.scribe_template_change(p_actor uuid,p_practice text,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v record; prof record; slot record; oldcmd record; ev public.scribe_option_changes%ROWTYPE; desired jsonb; a text:=p_request->>'action';
 tid uuid:=(p_request->>'templateId')::uuid; rid uuid:=(p_request->>'requestId')::uuid;
 rev bigint; command_time timestamptz; new_id uuid; target_time timestamptz; protected boolean; results jsonb:='[]'; out_result jsonb;
BEGIN
 SELECT * INTO prof FROM public.user_profiles WHERE id=p_actor;
 IF prof.id IS NULL OR prof.role NOT IN ('admin','verwaltung','lesezugriff') OR prof.patient_id IS NOT NULL
  OR NOT coalesce((prof.permissions->>'scribe_schreiben')::boolean,prof.role IN ('admin','verwaltung')) THEN RAISE EXCEPTION 'scribe_forbidden'; END IF;
 IF rid IS NULL OR a NOT IN ('hide','show','rename','restore_practice','undo','restore_at') THEN RAISE EXCEPTION 'input_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT * INTO oldcmd FROM public.scribe_template_commands WHERE request_id=rid;
 IF FOUND THEN
  IF oldcmd.actor_id<>p_actor OR oldcmd.request<>p_request THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN oldcmd.result;
 END IF;
 SELECT * INTO STRICT v FROM public.doku_vorlagen WHERE id=tid AND aktiv=true FOR UPDATE;
 PERFORM public.scribe_register_slots(tid,p_practice);
 SELECT coalesce(max(seq),0),greatest(clock_timestamp(),coalesce(max(created_at)+interval '1 microsecond',clock_timestamp())) INTO rev,command_time FROM public.scribe_option_changes WHERE template_id=tid AND praxis_id=p_practice;
 IF (p_request->>'expectedRevision') IS NULL OR rev<>(p_request->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'template_revision_stale'; END IF;
 IF a='undo' THEN
  SELECT * INTO ev FROM public.scribe_option_changes WHERE id=(p_request->>'changeId')::uuid AND template_id=tid AND praxis_id=p_practice;
  IF NOT FOUND THEN RAISE EXCEPTION 'change_not_found'; END IF;
 ELSIF a='restore_at' THEN
  target_time:=(p_request->>'at')::timestamptz;
  IF target_time IS NULL OR target_time>clock_timestamp() OR target_time<(SELECT min(created_at) FROM public.scribe_option_slots WHERE template_id=tid AND praxis_id=p_practice)
   THEN RAISE EXCEPTION 'history_time_unavailable'; END IF;
 END IF;
 FOR slot IN SELECT * FROM public.scribe_option_slots WHERE template_id=tid AND praxis_id=p_practice
  AND (a='restore_at' OR option_key=CASE WHEN a='undo' THEN ev.option_key ELSE p_request->>'optionKey' END) ORDER BY gruppe,option_index LOOP
  desired:=slot.state;
  IF a='hide' THEN desired:=jsonb_set(desired,'{hidden}','true');
  ELSIF a IN ('show','restore_practice') THEN
   IF a='restore_practice' AND slot.source<>'praxis' THEN RAISE EXCEPTION 'not_practice_option'; END IF;
   desired:=jsonb_set(desired,'{hidden}','false');
  ELSIF a='rename' THEN
   IF length(trim(coalesce(p_request->>'text',''))) NOT BETWEEN 1 AND 400 THEN RAISE EXCEPTION 'input_invalid'; END IF;
   desired:=jsonb_set(desired,'{text}',to_jsonb(trim(p_request->>'text')));
  ELSIF a='undo' THEN
   IF slot.last_change_id IS DISTINCT FROM ev.id THEN RAISE EXCEPTION 'change_superseded'; END IF;
   desired:=ev.before_state;
  ELSIF a='restore_at' THEN
   SELECT after_state INTO desired FROM public.scribe_option_changes WHERE option_key=slot.option_key AND created_at<=target_time ORDER BY seq DESC LIMIT 1;
   desired:=coalesce(desired,slot.baseline);
   IF slot.created_at>target_time THEN desired:=jsonb_set(slot.baseline,'{hidden}','true'); END IF;
  END IF;
  protected:=coalesce((v.struktur->'groups'->slot.gruppe->>'explizit')::boolean,false)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v.positionen,'[]'::jsonb)) r WHERE r->'if'->>'g'=slot.gruppe);
  IF protected AND (desired->>'text' IS DISTINCT FROM slot.state->>'text' OR
     ((desired->>'hidden')::boolean AND NOT (slot.state->>'hidden')::boolean)) THEN RAISE EXCEPTION 'template_group_protected'; END IF;
  INSERT INTO public.scribe_option_changes(template_id,praxis_id,behandlungsart,termin_typ,gruppe,option_key,action,before_state,after_state,actor_id,actor_name,reverses_id,request_id,created_at)
   VALUES(tid,p_practice,v.behandlungsart,v.termin_typ,slot.gruppe,slot.option_key,a,slot.state,desired,p_actor,coalesce(prof.display_name,'Praxis'),CASE WHEN a='undo' THEN ev.id END,rid,command_time) RETURNING id,seq INTO new_id,rev;
  UPDATE public.scribe_option_slots SET state=desired,last_change_id=new_id WHERE option_key=slot.option_key;
  -- Compatibility mirror only: immutable events remain the source of truth.
  IF slot.practice_option_id IS NOT NULL THEN UPDATE public.doku_vorlagen_optionen SET aktiv=NOT (desired->>'hidden')::boolean WHERE id=slot.practice_option_id; END IF;
  results:=results||jsonb_build_array(new_id);
 END LOOP;
 IF jsonb_array_length(results)=0 THEN RAISE EXCEPTION 'option_not_found'; END IF;
 out_result:=jsonb_build_object('ok',true,'revision',rev,'changeIds',results);
 INSERT INTO public.scribe_template_commands VALUES(rid,p_actor,p_request,out_result);
 RETURN out_result;
END $$;

CREATE TABLE public.scribe_inbox_entries (
 id uuid PRIMARY KEY, payload jsonb NOT NULL, revision bigint NOT NULL DEFAULT 1,
 created_by uuid, created_at timestamptz NOT NULL, deleted_at timestamptz,
 legacy_payload jsonb
);
CREATE TABLE public.scribe_inbox_events (
 entry_id uuid NOT NULL REFERENCES public.scribe_inbox_entries(id), ordinal int NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(entry_id,ordinal)
);
CREATE TABLE public.scribe_inbox_comments (
 id uuid PRIMARY KEY, entry_id uuid NOT NULL REFERENCES public.scribe_inbox_entries(id), payload jsonb NOT NULL
);
CREATE TABLE public.scribe_inbox_mail_jobs (
 entry_id uuid PRIMARY KEY REFERENCES public.scribe_inbox_entries(id), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
 attempts int NOT NULL DEFAULT 0, lease_until timestamptz, sent_at timestamptz, last_error text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.practice_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id uuid, recipient_role text,
 kind text NOT NULL CHECK(kind IN ('wunsch_status','antwort','update','wichtig')),
 title text NOT NULL, body text NOT NULL, link text NOT NULL CHECK(link LIKE '/%' AND link NOT LIKE '//%'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), visible_from timestamptz, visible_until timestamptz,
 source_key text NOT NULL, UNIQUE(source_key,recipient_id), UNIQUE(source_key,recipient_role),
 CHECK ((recipient_id IS NOT NULL)::int+(recipient_role IS NOT NULL)::int=1),
 CHECK(recipient_role IS NULL OR recipient_role IN ('admin','verwaltung','lesezugriff'))
);
CREATE TABLE public.practice_notification_reads (
 notification_id uuid NOT NULL REFERENCES public.practice_notifications(id), user_id uuid NOT NULL,
 read_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(notification_id,user_id)
);
CREATE INDEX ON public.practice_notifications(recipient_id,created_at DESC);
CREATE INDEX ON public.practice_notifications(recipient_role,created_at DESC);
CREATE FUNCTION public.practice_notification_visible(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.practice_notifications n JOIN public.user_profiles p ON p.id=auth.uid()
 WHERE n.id=p_id AND p.role IN ('admin','verwaltung','lesezugriff') AND p.patient_id IS NULL
 AND (n.recipient_id=p.id OR n.recipient_role=p.role) AND (n.visible_from IS NULL OR n.visible_from<=now()) AND (n.visible_until IS NULL OR n.visible_until>now()))
$$;
ALTER TABLE public.practice_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_notification_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_notifications,public.practice_notification_reads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.practice_notifications TO authenticated;
GRANT SELECT,INSERT ON public.practice_notification_reads TO authenticated;
CREATE POLICY own_bell ON public.practice_notifications FOR SELECT TO authenticated USING(public.practice_notification_visible(id));
CREATE POLICY own_bell_reads ON public.practice_notification_reads FOR SELECT TO authenticated USING(user_id=auth.uid() AND public.practice_notification_visible(notification_id));
CREATE POLICY own_bell_mark ON public.practice_notification_reads FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid() AND public.practice_notification_visible(notification_id));

-- Lock legacy source through snapshot and cutover. No mail or bells for historical import.
LOCK TABLE public.einstellungen IN SHARE ROW EXCLUSIVE MODE;
INSERT INTO public.scribe_inbox_entries(id,payload,created_by,created_at,legacy_payload)
 SELECT (e->>'id')::uuid,e-'kommentare'-'status_verlauf',(e->>'erstellt_von')::uuid,(e->>'erstellt_am')::timestamptz,e
 FROM public.einstellungen s CROSS JOIN LATERAL jsonb_array_elements(s.value) e WHERE s.key='scribe_praxis_inbox';
INSERT INTO public.scribe_inbox_events(entry_id,ordinal,payload)
 SELECT id,(e.ordinality-1)::int,e.value FROM public.scribe_inbox_entries CROSS JOIN LATERAL jsonb_array_elements(coalesce(legacy_payload->'status_verlauf','[]')) WITH ORDINALITY e;
INSERT INTO public.scribe_inbox_comments(id,entry_id,payload)
 SELECT (c->>'id')::uuid,id,c FROM public.scribe_inbox_entries CROSS JOIN LATERAL jsonb_array_elements(coalesce(legacy_payload->'kommentare','[]')) c;
CREATE TRIGGER scribe_inbox_events_immutable BEFORE UPDATE OR DELETE ON public.scribe_inbox_events FOR EACH ROW EXECUTE FUNCTION public.scribe_immutable_history();
CREATE FUNCTION public.scribe_legacy_inbox_frozen() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (TG_OP<>'INSERT' AND OLD.key='scribe_praxis_inbox') OR (TG_OP<>'DELETE' AND NEW.key='scribe_praxis_inbox') THEN RAISE EXCEPTION 'scribe_inbox_migrated'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER scribe_legacy_inbox_frozen BEFORE INSERT OR UPDATE OR DELETE ON public.einstellungen FOR EACH ROW EXECUTE FUNCTION public.scribe_legacy_inbox_frozen();

-- All writes, event append, bell notifications and mail enqueue commit together.
CREATE FUNCTION public.scribe_inbox_commit(p_entry jsonb,p_expected bigint,p_actor uuid,p_developer boolean,p_delete boolean DEFAULT false) RETURNS jsonb
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
   IF oldrow.id IS NOT NULL AND oldrow.created_by IS NOT NULL THEN
    INSERT INTO public.practice_notifications(recipient_id,kind,title,body,link,source_key)
     VALUES(oldrow.created_by,'wunsch_status','Neuer Stand zu deinem Eintrag',e->>'zu','/scribe?inbox='||eid,'inbox:'||eid||':status:'||n);
   END IF;
  ELSIF (SELECT payload FROM public.scribe_inbox_events WHERE entry_id=eid AND ordinal=n)<>e THEN RAISE EXCEPTION 'scribe_history_immutable'; END IF;
  n:=n+1;
 END LOOP;
 FOR c IN SELECT value FROM jsonb_array_elements(p_entry->'kommentare') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.scribe_inbox_comments WHERE id=(c->>'id')::uuid) THEN
   INSERT INTO public.scribe_inbox_comments VALUES((c->>'id')::uuid,eid,c);
   IF (p_entry->>'erstellt_von') IS NOT NULL THEN
    INSERT INTO public.practice_notifications(recipient_id,kind,title,body,link,source_key)
     VALUES((p_entry->>'erstellt_von')::uuid,'antwort','Neue Antwort auf deinen Eintrag',left(c->>'text',300),'/scribe?inbox='||eid,'inbox:comment:'||(c->>'id'));
   END IF;
  ELSE
   -- Compatibility for the existing per-comment mention read receipt only.
   IF EXISTS(SELECT 1 FROM public.scribe_inbox_comments WHERE id=(c->>'id')::uuid AND (entry_id<>eid OR payload-'gelesen_von'<>c-'gelesen_von')) THEN RAISE EXCEPTION 'scribe_history_immutable'; END IF;
   UPDATE public.scribe_inbox_comments SET payload=c WHERE id=(c->>'id')::uuid AND entry_id=eid;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'revision',newrev);
END $$;
CREATE FUNCTION public.scribe_claim_inbox_mail(p_entry uuid DEFAULT NULL) RETURNS SETOF public.scribe_inbox_mail_jobs
 LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
 UPDATE public.scribe_inbox_mail_jobs SET status='sending',attempts=attempts+1,lease_until=now()+interval '5 minutes'
 WHERE entry_id IN (SELECT entry_id FROM public.scribe_inbox_mail_jobs WHERE (p_entry IS NULL OR entry_id=p_entry)
 AND (status IN ('pending','failed') OR (status='sending' AND lease_until<now())) AND attempts<10 ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *
$$;
CREATE FUNCTION public.scribe_update_bell() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r text; BEGIN
 IF NEW.status='published' AND (TG_OP='INSERT' OR OLD.status<>'published') THEN
  FOREACH r IN ARRAY NEW.audience_roles LOOP
   INSERT INTO public.practice_notifications(recipient_role,kind,title,body,link,source_key,visible_from,visible_until)
    VALUES(r,CASE WHEN NEW.category='wichtig' THEN 'wichtig' ELSE 'update' END,NEW.title_de,NEW.summary_de,'/scribe?update='||NEW.id,'update:'||NEW.id,NEW.visible_from,NEW.visible_until)
    ON CONFLICT(source_key,recipient_role) DO NOTHING;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scribe_update_bell AFTER INSERT OR UPDATE ON public.praxis_updates FOR EACH ROW EXECUTE FUNCTION public.scribe_update_bell();

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['scribe_option_slots','scribe_template_commands','scribe_option_changes','scribe_inbox_entries','scribe_inbox_events','scribe_inbox_comments','scribe_inbox_mail_jobs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
 END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.practice_notifications,public.practice_notification_reads TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.scribe_option_changes_seq_seq TO service_role;
REVOKE ALL ON FUNCTION public.scribe_immutable_history(),public.scribe_register_slots(uuid,text),public.scribe_register_new_option(),public.scribe_template_change(uuid,text,jsonb),public.practice_notification_visible(uuid),public.scribe_legacy_inbox_frozen(),public.scribe_inbox_commit(jsonb,bigint,uuid,boolean,boolean),public.scribe_claim_inbox_mail(uuid),public.scribe_update_bell() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.scribe_register_slots(uuid,text),public.scribe_template_change(uuid,text,jsonb),public.scribe_inbox_commit(jsonb,bigint,uuid,boolean,boolean),public.scribe_claim_inbox_mail(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.practice_notification_visible(uuid) TO authenticated,service_role;
CREATE FUNCTION public.practice_mark_notifications(p_id uuid DEFAULT NULL,p_before timestamptz DEFAULT now()) RETURNS int
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n int; BEGIN
 IF p_id IS NOT NULL AND NOT public.practice_notification_visible(p_id) THEN RAISE EXCEPTION 'notification_not_found'; END IF;
 INSERT INTO public.practice_notification_reads(notification_id,user_id)
 SELECT id,auth.uid() FROM public.practice_notifications WHERE (p_id IS NULL OR id=p_id)
 AND created_at<=least(p_before,now()) AND public.practice_notification_visible(id)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.practice_mark_notifications(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_mark_notifications(uuid,timestamptz) TO authenticated;
COMMIT;
