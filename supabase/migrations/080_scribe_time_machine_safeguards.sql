-- 11.11.2026: isolate malformed templates, protect seed indices and suppress self-notifications.
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.scribe_template_commands ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.scribe_option_changes ALTER COLUMN actor_id DROP NOT NULL;
ALTER TABLE public.scribe_option_changes ADD COLUMN confirmation jsonb;
ALTER TABLE public.scribe_option_slots ADD COLUMN layout_text text;
UPDATE public.scribe_option_slots SET layout_text=baseline->>'text' WHERE layout_text IS NULL;
ALTER TABLE public.scribe_option_changes DROP CONSTRAINT scribe_option_changes_action_check;
ALTER TABLE public.scribe_option_changes ADD CONSTRAINT scribe_option_changes_action_check
 CHECK(action IN ('hide','show','rename','restore_practice','undo','restore_at','add','reconcile'));

-- A same-index text rewrite can be reconciled without moving any billing rule.
-- Keep the original baseline for old confirmations and track the system repair.
DO $$
DECLARE slot record; raw_text text; request_id uuid; change_id uuid;
BEGIN
 FOR slot IN
  SELECT s.*,v.struktur,v.behandlungsart,v.termin_typ
  FROM public.scribe_option_slots s JOIN public.doku_vorlagen v ON v.id=s.template_id
  WHERE s.source='vorlage'
 LOOP
  IF jsonb_array_length(coalesce(slot.struktur->'groups'->slot.gruppe->'opts','[]'::jsonb))<>
     (SELECT count(*) FROM public.scribe_option_slots x WHERE x.template_id=slot.template_id AND x.praxis_id=slot.praxis_id AND x.gruppe=slot.gruppe AND x.source='vorlage') THEN
   CONTINUE;
  END IF;
  raw_text:=slot.struktur->'groups'->slot.gruppe->'opts'->slot.option_index->>'t';
  IF raw_text IS NOT NULL AND raw_text IS DISTINCT FROM slot.layout_text
     AND slot.state->>'text'=slot.baseline->>'text' THEN
   request_id:=gen_random_uuid();
   INSERT INTO public.scribe_option_changes(template_id,praxis_id,behandlungsart,termin_typ,gruppe,option_key,action,
     before_state,after_state,actor_id,actor_name,request_id,confirmation)
   VALUES(slot.template_id,slot.praxis_id,slot.behandlungsart,slot.termin_typ,slot.gruppe,slot.option_key,'reconcile',
     slot.state,jsonb_set(slot.state,'{text}',to_jsonb(raw_text)),NULL,'System',request_id,
     jsonb_build_object('kind','automatic_safe_reconciliation','confirmedAt',clock_timestamp()))
   RETURNING id INTO change_id;
   UPDATE public.scribe_option_slots SET state=jsonb_set(state,'{text}',to_jsonb(raw_text)),layout_text=raw_text,last_change_id=change_id
    WHERE option_key=slot.option_key;
  END IF;
 END LOOP;
END $$;

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

-- Practice decisions replace the previous hard block. Protected changes need
-- a matching second confirmation; the immutable event stores who confirmed,
-- when, and which position rules were attached at that moment.
CREATE OR REPLACE FUNCTION public.scribe_template_change(p_actor uuid,p_practice text,p_request jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v record; prof record; slot record; oldcmd record; ev public.scribe_option_changes%ROWTYPE; desired jsonb; a text:=p_request->>'action';
 tid uuid:=(p_request->>'templateId')::uuid; rid uuid:=(p_request->>'requestId')::uuid;
 rev bigint; command_time timestamptz; new_id uuid; target_time timestamptz; protected boolean; results jsonb:='[]'; out_result jsonb;
 actor_name text; attached jsonb; confirmation jsonb; visible_others int; new_option uuid; group_name text;
BEGIN
 IF p_actor IS NULL THEN
  actor_name:=btrim(coalesce(p_request->>'confirmedBy',''));
  IF p_request->>'source'<>'praxis_pass' OR actor_name='' THEN RAISE EXCEPTION 'scribe_forbidden'; END IF;
 ELSE
  SELECT * INTO prof FROM public.user_profiles WHERE id=p_actor;
  IF prof.id IS NULL OR prof.role NOT IN ('admin','verwaltung','lesezugriff') OR prof.patient_id IS NOT NULL
   OR NOT coalesce((prof.permissions->>'scribe_schreiben')::boolean,prof.role IN ('admin','verwaltung')) THEN RAISE EXCEPTION 'scribe_forbidden'; END IF;
  actor_name:=coalesce(prof.display_name,'Praxis');
 END IF;
 IF rid IS NULL OR a NOT IN ('hide','show','rename','restore_practice','undo','restore_at','add') THEN RAISE EXCEPTION 'input_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
 SELECT * INTO oldcmd FROM public.scribe_template_commands WHERE request_id=rid;
 IF FOUND THEN
  IF oldcmd.actor_id IS DISTINCT FROM p_actor OR oldcmd.request<>p_request THEN RAISE EXCEPTION 'idempotency_conflict'; END IF;
  RETURN oldcmd.result;
 END IF;
 SELECT * INTO STRICT v FROM public.doku_vorlagen WHERE id=tid AND aktiv=true FOR UPDATE;
 PERFORM public.scribe_register_slots(tid,p_practice);
 SELECT coalesce(max(seq),0),greatest(clock_timestamp(),coalesce(max(created_at)+interval '1 microsecond',clock_timestamp())) INTO rev,command_time FROM public.scribe_option_changes WHERE template_id=tid AND praxis_id=p_practice;
 IF (p_request->>'expectedRevision') IS NULL OR rev<>(p_request->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'template_revision_stale'; END IF;
 IF a='add' THEN
  group_name:=p_request->>'group';
  IF group_name IS NULL OR NOT (v.struktur->'groups' ? group_name) OR length(btrim(coalesce(p_request->>'text',''))) NOT BETWEEN 1 AND 400 THEN RAISE EXCEPTION 'input_invalid'; END IF;
  protected:=coalesce((v.struktur->'groups'->group_name->>'explizit')::boolean,false)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v.positionen,'[]'::jsonb)) r WHERE r->'if'->>'g'=group_name);
  SELECT coalesce(jsonb_agg(jsonb_build_object('ruleIndex',ordinality-1,'code',r->>'code','text',r->>'text','optionIndex',r->'if'->'i')),'[]'::jsonb)
   INTO attached FROM jsonb_array_elements(coalesce(v.positionen,'[]'::jsonb)) WITH ORDINALITY rules(r,ordinality) WHERE r->'if'->>'g'=group_name;
  IF protected AND coalesce((p_request->>'confirmProtected')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'template_confirmation_required'; END IF;
  INSERT INTO public.doku_vorlagen_optionen(praxis_id,behandlungsart,termin_typ,gruppe,text,aktiv,sort_index)
   VALUES(p_practice,v.behandlungsart,v.termin_typ,group_name,btrim(p_request->>'text'),false,
    coalesce((SELECT max(sort_index)+1 FROM public.doku_vorlagen_optionen WHERE praxis_id=p_practice AND behandlungsart=v.behandlungsart AND termin_typ=v.termin_typ AND gruppe=group_name),0)) RETURNING id INTO new_option;
  PERFORM public.scribe_register_slots(tid,p_practice);
  SELECT * INTO STRICT slot FROM public.scribe_option_slots WHERE practice_option_id=new_option;
  desired:=jsonb_set(slot.state,'{hidden}','false');
  confirmation:=CASE WHEN protected THEN jsonb_build_object('kind','practice_second_confirmation','confirmedBy',actor_name,'confirmedAt',command_time,
   'fingerprint',p_request->>'confirmationFingerprint','positions',attached) END;
  INSERT INTO public.scribe_option_changes(template_id,praxis_id,behandlungsart,termin_typ,gruppe,option_key,action,before_state,after_state,actor_id,actor_name,request_id,created_at,confirmation)
   VALUES(tid,p_practice,v.behandlungsart,v.termin_typ,group_name,slot.option_key,a,slot.state,desired,p_actor,actor_name,rid,command_time,confirmation)
   RETURNING id,seq INTO new_id,rev;
  UPDATE public.scribe_option_slots SET state=desired,last_change_id=new_id WHERE option_key=slot.option_key;
  UPDATE public.doku_vorlagen_optionen SET aktiv=true WHERE id=new_option;
  results:=jsonb_build_array(new_id);
 ELSE
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
   IF desired=slot.state THEN CONTINUE; END IF;
   protected:=coalesce((v.struktur->'groups'->slot.gruppe->>'explizit')::boolean,false)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(v.positionen,'[]'::jsonb)) r WHERE r->'if'->>'g'=slot.gruppe);
   IF (desired->>'hidden')::boolean AND NOT (slot.state->>'hidden')::boolean AND coalesce((v.struktur->'groups'->slot.gruppe->>'explizit')::boolean,false) THEN
    SELECT count(*) INTO visible_others FROM public.scribe_option_slots x WHERE x.template_id=tid AND x.praxis_id=p_practice AND x.gruppe=slot.gruppe AND x.option_key<>slot.option_key AND NOT (x.state->>'hidden')::boolean;
    IF visible_others=0 THEN RAISE EXCEPTION 'template_last_required_option'; END IF;
   END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('ruleIndex',ordinality-1,'code',r->>'code','text',r->>'text','optionIndex',r->'if'->'i')),'[]'::jsonb)
    INTO attached FROM jsonb_array_elements(coalesce(v.positionen,'[]'::jsonb)) WITH ORDINALITY rules(r,ordinality) WHERE r->'if'->>'g'=slot.gruppe;
   IF protected AND coalesce((p_request->>'confirmProtected')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'template_confirmation_required'; END IF;
   confirmation:=CASE WHEN protected THEN jsonb_build_object('kind','practice_second_confirmation','confirmedBy',actor_name,'confirmedAt',command_time,
    'fingerprint',p_request->>'confirmationFingerprint','positions',attached) END;
   INSERT INTO public.scribe_option_changes(template_id,praxis_id,behandlungsart,termin_typ,gruppe,option_key,action,before_state,after_state,actor_id,actor_name,reverses_id,request_id,created_at,confirmation)
    VALUES(tid,p_practice,v.behandlungsart,v.termin_typ,slot.gruppe,slot.option_key,a,slot.state,desired,p_actor,actor_name,CASE WHEN a='undo' THEN ev.id END,rid,command_time,confirmation) RETURNING id,seq INTO new_id,rev;
   UPDATE public.scribe_option_slots SET state=desired,last_change_id=new_id WHERE option_key=slot.option_key;
   IF slot.practice_option_id IS NOT NULL THEN UPDATE public.doku_vorlagen_optionen SET aktiv=NOT (desired->>'hidden')::boolean,text=desired->>'text' WHERE id=slot.practice_option_id; END IF;
   results:=results||jsonb_build_array(new_id);
  END LOOP;
 END IF;
 IF jsonb_array_length(results)=0 THEN RAISE EXCEPTION 'option_not_found'; END IF;
 out_result:=jsonb_build_object('ok',true,'revision',rev,'changeIds',results,'confirmationRecorded',coalesce((p_request->>'confirmProtected')::boolean,false));
 INSERT INTO public.scribe_template_commands VALUES(rid,p_actor,p_request,out_result);
 RETURN out_result;
END $$;

-- Canonical day decisions and their second-confirmation audit must be one
-- SECURITY DEFINER transaction. A follow-up service_role UPDATE would be
-- rejected by guard_scribe_canonical_content from migration 076.
CREATE FUNCTION public.decide_doku_day_part(
  p_day_id uuid,
  p_part_id uuid,
  p_expected_version integer,
  p_decision text,
  p_reason text,
  p_corrects_part_id uuid,
  p_resulting_text text,
  p_resulting_positions jsonb,
  p_conflicts jsonb,
  p_ivoris_delta_text text,
  p_consistency_audit jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $function$
DECLARE result jsonb; entry_id uuid; entry_version integer;
BEGIN
  result := public.decide_doku_day_part(
    p_day_id,p_part_id,p_expected_version,p_decision,p_reason,p_corrects_part_id,
    p_resulting_text,p_resulting_positions,p_conflicts,p_ivoris_delta_text
  );
  IF p_consistency_audit IS NULL THEN RETURN result; END IF;
  IF p_consistency_audit->>'code' <> 'confirmed_despite_warning'
     OR coalesce(p_consistency_audit->'confirmedBy'->>'name','')='' THEN
    RAISE EXCEPTION 'input_invalid';
  END IF;
  SELECT d.canonical_entry_id INTO entry_id
    FROM public.doku_tagesdatensaetze d WHERE d.id=p_day_id;
  entry_version := (result->>'entryVersion')::integer;
  UPDATE public.doku_eintraege
    SET variablen=jsonb_set(coalesce(variablen,'{}'::jsonb),'{_consistencyConfirmation}',p_consistency_audit,true)
    WHERE id=entry_id AND version=entry_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'entry_version_stale'; END IF;
  UPDATE public.doku_eintrag_versionen
    SET variablen=jsonb_set(coalesce(variablen,'{}'::jsonb),'{_consistencyConfirmation}',p_consistency_audit,true)
    WHERE eintrag_id=entry_id AND version=entry_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'entry_history_missing'; END IF;
  RETURN result || jsonb_build_object('auditStored',true);
END $function$;

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

REVOKE ALL ON FUNCTION public.scribe_seed_option_layout(jsonb),public.scribe_protect_seed_option_layout(),public.decide_doku_day_part(uuid,uuid,integer,text,text,uuid,text,jsonb,jsonb,text,jsonb),public.scribe_inbox_commit(jsonb,bigint,uuid,boolean,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.decide_doku_day_part(uuid,uuid,integer,text,text,uuid,text,jsonb,jsonb,text,jsonb) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.scribe_inbox_commit(jsonb,bigint,uuid,boolean,boolean) TO service_role;

COMMIT;
