-- 107_animahost_conversation_learning.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $$ BEGIN IF to_regclass('public.animahost_knowledge_versions') IS NULL OR to_regclass('public.patient_access_memberships') IS NULL OR to_regclass('public.animaline_connections') IS NOT NULL THEN RAISE EXCEPTION 'Falsches Projekt: Anima Cura (zymqxzhjbcxzhzvjqvbv), nach 104 erforderlich.'; END IF; END $$;
BEGIN;
CREATE TABLE public.animahost_learning_sources(
 tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),id uuid NOT NULL,
 source text NOT NULL CHECK(source IN('practice_phone','leitstand')),source_at timestamptz NOT NULL,chat_jid text NOT NULL,
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='array'),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','processing','done','error')),attempts integer NOT NULL DEFAULT 0,
 lease uuid,available_at timestamptz NOT NULL DEFAULT now(),last_error text,created_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,
 PRIMARY KEY(tenant_id,id));
CREATE INDEX animahost_learning_queue ON public.animahost_learning_sources(tenant_id,available_at) WHERE state IN('queued','processing');
CREATE TABLE public.animahost_learning_suggestions(
 tenant_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),source_id uuid NOT NULL,ordinal integer NOT NULL,
 version integer NOT NULL DEFAULT 1,state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','approved','rejected')),
 topic text NOT NULL,kind text NOT NULL CHECK(kind IN('recommendation','communication','confusion','impatience','positive_feedback','correction')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),knowledge_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),reviewed_by uuid,reviewed_at timestamptz,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,source_id,ordinal),FOREIGN KEY(tenant_id,source_id) REFERENCES public.animahost_learning_sources(tenant_id,id));
CREATE TABLE public.animahost_learning_audit(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL,suggestion_id uuid NOT NULL,version integer NOT NULL,actor_id uuid NOT NULL,action text NOT NULL,before_value jsonb NOT NULL,after_value jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.animahost_learning_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animahost_learning_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animahost_learning_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.animahost_learning_sources,public.animahost_learning_suggestions,public.animahost_learning_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.animahost_learning_sources TO service_role;
GRANT SELECT ON public.animahost_learning_suggestions,public.animahost_learning_audit TO service_role;
CREATE POLICY learning_sources_service ON public.animahost_learning_sources TO service_role USING(true) WITH CHECK(true);
CREATE POLICY learning_suggestions_service ON public.animahost_learning_suggestions FOR SELECT TO service_role USING(true);
CREATE POLICY learning_audit_service ON public.animahost_learning_audit FOR SELECT TO service_role USING(true);
CREATE FUNCTION public.animahost_claim_learning(p_tenant uuid) RETURNS SETOF public.animahost_learning_sources LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE picked uuid;
BEGIN
 UPDATE public.animahost_learning_sources SET state='error',last_error='learning_attempts_exhausted',lease=NULL WHERE tenant_id=p_tenant AND state IN('queued','processing') AND attempts>=5 AND available_at<=now();
 SELECT id INTO picked FROM public.animahost_learning_sources WHERE tenant_id=p_tenant AND state IN('queued','processing') AND available_at<=now() ORDER BY source_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF picked IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE public.animahost_learning_sources SET state='processing',attempts=attempts+1,lease=gen_random_uuid(),available_at=now()+interval '5 minutes' WHERE tenant_id=p_tenant AND id=picked RETURNING *;
END $$;
CREATE FUNCTION public.animahost_finish_learning(p_tenant uuid,p_source uuid,p_lease uuid,p_suggestions jsonb,p_error text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE src public.animahost_learning_sources;item jsonb;n integer:=0;
BEGIN
 SELECT * INTO src FROM public.animahost_learning_sources WHERE tenant_id=p_tenant AND id=p_source FOR UPDATE;
 IF src.state IS DISTINCT FROM 'processing' OR src.lease IS DISTINCT FROM p_lease THEN RAISE EXCEPTION 'learning_lease_lost' USING ERRCODE='40001'; END IF;
 IF p_error IS NULL THEN
  IF jsonb_typeof(p_suggestions)<>'array' OR jsonb_array_length(p_suggestions)>3 THEN RAISE EXCEPTION 'learning_invalid'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_suggestions) LOOP
   INSERT INTO public.animahost_learning_suggestions(tenant_id,source_id,ordinal,topic,kind,payload) VALUES(p_tenant,p_source,n,item->>'topic',item->>'kind',item) ON CONFLICT(tenant_id,source_id,ordinal) DO NOTHING;n:=n+1;
  END LOOP;
 END IF;
 UPDATE public.animahost_learning_sources SET state=CASE WHEN p_error IS NULL THEN 'done' WHEN attempts>=5 THEN 'error' ELSE 'queued' END,available_at=now()+interval '5 minutes',last_error=p_error,processed_at=CASE WHEN p_error IS NULL THEN now() END,lease=NULL WHERE tenant_id=p_tenant AND id=p_source;
END $$;
CREATE FUNCTION public.animahost_review_learning(p_tenant uuid,p_id uuid,p_expected integer,p_actor uuid,p_action text,p_payload jsonb DEFAULT NULL) RETURNS public.animahost_learning_suggestions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE s public.animahost_learning_suggestions;before_row jsonb;k public.animahost_knowledge_versions;
BEGIN
 IF NOT EXISTS(SELECT FROM public.user_profiles WHERE id=p_actor AND role='admin') THEN RAISE EXCEPTION 'learning_actor_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.animahost_learning_suggestions WHERE tenant_id=p_tenant AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'learning_not_found' USING ERRCODE='P0002'; END IF;
 IF s.version<>p_expected THEN RAISE EXCEPTION 'learning_version_conflict' USING ERRCODE='40001'; END IF;
 IF p_action IS NULL OR p_action NOT IN('edit','approve','reject') OR p_action IN('edit','approve') AND s.state<>'draft' OR p_action='reject' AND s.state='rejected' THEN RAISE EXCEPTION 'learning_transition_invalid' USING ERRCODE='22023'; END IF;
 before_row:=to_jsonb(s);
 IF p_action='edit' THEN
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR NOT(p_payload ? 'title' AND p_payload ? 'content') OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 160 OR length(btrim(p_payload->>'content')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'learning_invalid' USING ERRCODE='22023'; END IF;
  s.payload:=s.payload||jsonb_build_object('title',p_payload->>'title','content',p_payload->>'content');
 ELSIF p_action='approve' THEN
  SELECT * INTO k FROM public.animahost_change_knowledge(p_tenant,s.id,0,p_actor,'draft',jsonb_build_object('area',CASE WHEN s.kind IN('communication','confusion','impatience','positive_feedback') THEN 'gespraech' WHEN (s.payload->>'medical')::boolean THEN 'selbsthilfe' ELSE 'praxisablauf' END,'title',s.payload->>'title','content',s.payload->>'content','source','praxis','validFrom',(now() AT TIME ZONE 'Europe/Berlin')::date,'origin','conversation','learningSuggestionId',s.id,'learningSourceId',s.source_id));
  SELECT * INTO k FROM public.animahost_change_knowledge(p_tenant,s.id,k.version,p_actor,'approve',NULL);
  s.knowledge_id:=k.id;s.state:='approved';
 ELSE
  IF s.knowledge_id IS NOT NULL THEN
   SELECT * INTO k FROM public.animahost_knowledge_versions WHERE tenant_id=p_tenant AND id=s.knowledge_id ORDER BY version DESC LIMIT 1;
   PERFORM public.animahost_change_knowledge(p_tenant,k.id,k.version,p_actor,'deactivate',NULL);
  END IF;
  s.state:='rejected';
 END IF;
 UPDATE public.animahost_learning_suggestions SET version=version+1,state=s.state,payload=s.payload,knowledge_id=s.knowledge_id,updated_at=now(),reviewed_by=p_actor,reviewed_at=now() WHERE tenant_id=p_tenant AND id=p_id RETURNING * INTO s;
 INSERT INTO public.animahost_learning_audit(tenant_id,suggestion_id,version,actor_id,action,before_value,after_value) VALUES(p_tenant,p_id,s.version,p_actor,p_action,before_row,to_jsonb(s));RETURN s;
END $$;
-- The existing knowledge API must not bypass practice-leadership approval or remove provenance.
CREATE FUNCTION public.animahost_learning_knowledge_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT FROM public.animahost_learning_suggestions WHERE tenant_id=NEW.tenant_id AND id=NEW.id) THEN
  NEW.metadata:=NEW.metadata||jsonb_build_object('origin','conversation','learningSuggestionId',NEW.id);
  IF NEW.approved_at IS NOT NULL AND NOT EXISTS(SELECT FROM public.user_profiles WHERE id=NEW.approved_by AND role='admin') THEN RAISE EXCEPTION 'learning_actor_forbidden' USING ERRCODE='42501'; END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER animahost_learning_knowledge_guard BEFORE INSERT ON public.animahost_knowledge_versions FOR EACH ROW EXECUTE FUNCTION public.animahost_learning_knowledge_guard();
REVOKE ALL ON FUNCTION public.animahost_claim_learning(uuid),public.animahost_finish_learning(uuid,uuid,uuid,jsonb,text),public.animahost_review_learning(uuid,uuid,integer,uuid,text,jsonb),public.animahost_learning_knowledge_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.animahost_claim_learning(uuid),public.animahost_finish_learning(uuid,uuid,uuid,jsonb,text),public.animahost_review_learning(uuid,uuid,integer,uuid,text,jsonb) TO service_role;
CREATE FUNCTION public.animahost_learning_summary(p_tenant uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('groups',coalesce((SELECT jsonb_agg(to_jsonb(g)) FROM (SELECT s.topic,s.kind,s.state,count(*) suggestions,count(distinct s.source_id) reply_examples,count(distinct src.chat_jid) chats,min(src.source_at) first_at,max(src.source_at) last_at FROM public.animahost_learning_suggestions s JOIN public.animahost_learning_sources src ON src.tenant_id=s.tenant_id AND src.id=s.source_id WHERE s.tenant_id=p_tenant GROUP BY s.topic,s.kind,s.state) g),'[]'::jsonb),'queue',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT state,count(*) count,min(source_at) oldest_source FROM public.animahost_learning_sources WHERE tenant_id=p_tenant GROUP BY state) q),'[]'::jsonb),'asOf',now());
$$;
REVOKE ALL ON FUNCTION public.animahost_learning_summary(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.animahost_learning_summary(uuid) TO service_role;
CREATE INDEX animahost_learning_list ON public.animahost_learning_suggestions(tenant_id,state,created_at DESC,id);
COMMIT;
SELECT '107_animahost_conversation_learning.sql' AS dateiname,'eingespielt' AS status;
