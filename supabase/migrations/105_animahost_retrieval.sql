-- 105_animahost_retrieval.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $guard$
BEGIN
 IF to_regclass('public.animahost_knowledge_versions') IS NULL OR to_regclass('public.patient_access_memberships') IS NULL
 OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 105_animahost_retrieval.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv), nach 103 und 104.';
 END IF;
END $guard$;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE TABLE public.animahost_retrieval_documents (
 tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
 kind text NOT NULL CHECK(kind IN ('gold','knowledge','rule','history')),
 ref text NOT NULL CHECK(length(ref) BETWEEN 1 AND 200),
 version integer NOT NULL CHECK(version>0),
 source_at timestamptz NOT NULL,
 title text NOT NULL,
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 12000),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
 origin_ref jsonb NOT NULL DEFAULT '{}',
 draft boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 content_hash text NOT NULL,
 embedding public.vector(384),
 embedding_model text,
 indexed_at timestamptz,
 created_by uuid,
 PRIMARY KEY(tenant_id,kind,ref,version)
);
CREATE INDEX animahost_retrieval_vectors ON public.animahost_retrieval_documents USING hnsw (embedding public.vector_cosine_ops);
CREATE INDEX animahost_retrieval_pending ON public.animahost_retrieval_documents(tenant_id,kind) WHERE embedding IS NULL;
ALTER TABLE public.animahost_retrieval_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.animahost_retrieval_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.animahost_retrieval_documents TO service_role;
CREATE POLICY animahost_retrieval_service ON public.animahost_retrieval_documents TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.animahost_retrieval_match(p_tenant uuid,p_vector public.vector(384),p_model text,p_preview boolean DEFAULT false,p_day date DEFAULT CURRENT_DATE,p_exclude_chat text DEFAULT NULL)
RETURNS SETOF public.animahost_retrieval_documents LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 WITH eligible AS MATERIALIZED (
  SELECT d.* FROM public.animahost_retrieval_documents d WHERE d.tenant_id=p_tenant AND d.active AND d.embedding_model=p_model
  AND (p_exclude_chat IS NULL OR d.kind<>'history' OR d.origin_ref->>'chatHash' IS DISTINCT FROM p_exclude_chat)
  AND d.embedding IS NOT NULL AND (NOT d.draft OR p_preview AND d.kind='knowledge')
  AND (d.kind<>'rule' OR d.version=(SELECT active_rulebook_version FROM public.animahost_whatsapp_settings WHERE tenant_id=p_tenant))
  AND (d.kind<>'knowledge' OR (d.draft AND p_preview AND d.version=(SELECT max(kv.version) FROM public.animahost_knowledge_versions kv WHERE kv.tenant_id=p_tenant AND kv.id::text=d.ref)) OR EXISTS(
   SELECT 1 FROM public.animahost_active_knowledge(p_tenant,p_day) k WHERE k.id::text=d.ref AND k.version=d.version))
 ), ranked AS (
  SELECT e.*,row_number() OVER(PARTITION BY kind ORDER BY embedding <=> p_vector,ref) AS rank FROM eligible e
 ) SELECT tenant_id,kind,ref,version,source_at,title,content,payload,origin_ref,draft,active,content_hash,
  embedding,embedding_model,indexed_at,created_by FROM ranked
 WHERE rank<=CASE kind WHEN 'gold' THEN 3 WHEN 'knowledge' THEN 8 WHEN 'rule' THEN 6 ELSE 5 END
 ORDER BY CASE kind WHEN 'gold' THEN 0 WHEN 'knowledge' THEN 1 WHEN 'rule' THEN 2 ELSE 3 END,rank
$$;
REVOKE ALL ON FUNCTION public.animahost_retrieval_match(uuid,public.vector,text,boolean,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.animahost_retrieval_match(uuid,public.vector,text,boolean,date,text) TO service_role;

CREATE TABLE public.animahost_reply_evidence (
 tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),message_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),architecture text NOT NULL DEFAULT 'retrieval-v1',
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 timings jsonb NOT NULL DEFAULT '{}',PRIMARY KEY(tenant_id,message_id)
);
ALTER TABLE public.animahost_reply_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.animahost_reply_evidence FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.animahost_reply_evidence TO service_role;
CREATE POLICY animahost_reply_evidence_service ON public.animahost_reply_evidence TO service_role USING(true) WITH CHECK(true);

CREATE FUNCTION public.animahost_mark_gold(p_tenant uuid,p_actor uuid,p_ref text,p_question text,p_answer text,p_context text,p_at timestamptz)
RETURNS public.animahost_retrieval_documents LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result public.animahost_retrieval_documents; v integer; c text;
BEGIN
 IF NOT EXISTS(SELECT FROM public.user_profiles WHERE id=p_actor AND role IN ('admin','verwaltung')) THEN RAISE EXCEPTION 'gold_actor_forbidden' USING ERRCODE='42501'; END IF;
 IF length(btrim(p_question)) NOT BETWEEN 1 AND 4000 OR length(btrim(p_answer)) NOT BETWEEN 1 AND 2000 OR p_ref IS NULL OR p_at IS NULL THEN RAISE EXCEPTION 'gold_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_ref,0));
 SELECT coalesce(max(version),0)+1 INTO v FROM public.animahost_retrieval_documents WHERE tenant_id=p_tenant AND kind='gold' AND ref=p_ref;
 c:=p_question||E'\n'||coalesce(p_context,'')||E'\n'||p_answer;
 UPDATE public.animahost_retrieval_documents SET active=false WHERE tenant_id=p_tenant AND kind='gold' AND ref=p_ref;
 INSERT INTO public.animahost_retrieval_documents(tenant_id,kind,ref,version,source_at,title,content,payload,content_hash,created_by)
 VALUES(p_tenant,'gold',p_ref,v,p_at,'Praxis-Goldbeispiel',c,jsonb_build_object('question',p_question,'answer',p_answer,'context',p_context),md5(c),p_actor) RETURNING * INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.animahost_mark_gold(uuid,uuid,text,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.animahost_mark_gold(uuid,uuid,text,text,text,text,timestamptz) TO service_role;
SELECT '105_animahost_retrieval.sql' AS dateiname,'eingespielt' AS status;
