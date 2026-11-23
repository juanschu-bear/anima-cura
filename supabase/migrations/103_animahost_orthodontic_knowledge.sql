-- 103_animahost_orthodontic_knowledge.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.animahost_whatsapp_settings') IS NULL OR to_regclass('public.animahost_whatsapp_rulebook_versions') IS NULL
    OR to_regclass('public.patient_access_memberships') IS NULL OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 103_animahost_orthodontic_knowledge.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;

 CREATE TABLE public.animahost_knowledge_versions (
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  id uuid NOT NULL,
  version integer NOT NULL CHECK (version>0),
  area text NOT NULL CHECK (area IN ('apparatur','problem','selbsthilfe','warnzeichen','behandlungsphase','praxisablauf','begriff')),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  content text NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 4000),
  source text NOT NULL CHECK (source IN ('fachlich','praxis')),
  active boolean NOT NULL,
  valid_from date NOT NULL,
  approved_at timestamptz,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  PRIMARY KEY (tenant_id,id,version),
  CHECK ((approved_at IS NULL)=(approved_by IS NULL)),
  CHECK (NOT active OR approved_at IS NOT NULL)
 );
 ALTER TABLE public.animahost_knowledge_versions ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_knowledge_versions FROM PUBLIC,anon,authenticated,service_role;
 GRANT SELECT ON public.animahost_knowledge_versions TO service_role;
 CREATE POLICY animahost_knowledge_service_read ON public.animahost_knowledge_versions FOR SELECT TO service_role USING (true);

 EXECUTE $ddl$CREATE FUNCTION public.animahost_change_knowledge(p_tenant uuid,p_id uuid,p_expected integer,p_actor uuid,p_action text,p_entry jsonb)
 RETURNS public.animahost_knowledge_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
 DECLARE latest public.animahost_knowledge_versions;
 BEGIN
  IF NOT EXISTS(SELECT FROM public.user_profiles WHERE id=p_actor AND role IN ('admin','verwaltung')) THEN
   RAISE EXCEPTION 'knowledge_actor_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('draft','approve','deactivate') OR p_id IS NULL OR p_tenant IS NULL OR p_expected IS NULL THEN
   RAISE EXCEPTION 'knowledge_invalid' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||p_id::text,0));
  SELECT * INTO latest FROM public.animahost_knowledge_versions
   WHERE tenant_id=p_tenant AND id=p_id ORDER BY version DESC LIMIT 1;
  IF coalesce(latest.version,0)<>p_expected THEN RAISE EXCEPTION 'knowledge_version_conflict' USING ERRCODE='40001'; END IF;
  IF p_action<>'draft' AND latest.version IS NULL THEN RAISE EXCEPTION 'knowledge_not_found' USING ERRCODE='P0002'; END IF;
  IF p_action='approve' AND latest.approved_at IS NOT NULL THEN RAISE EXCEPTION 'knowledge_not_draft' USING ERRCODE='22023'; END IF;
  IF p_action='deactivate' AND NOT coalesce((SELECT active FROM public.animahost_knowledge_versions
    WHERE tenant_id=p_tenant AND id=p_id AND approved_at IS NOT NULL ORDER BY version DESC LIMIT 1),false) THEN
   RAISE EXCEPTION 'knowledge_not_active' USING ERRCODE='22023'; END IF;
  IF p_action='draft' THEN
   latest.area:=p_entry->>'area'; latest.title:=p_entry->>'title'; latest.content:=p_entry->>'content';
   latest.source:=p_entry->>'source'; latest.valid_from:=(p_entry->>'validFrom')::date;
  ELSIF p_action='deactivate' THEN
   latest.valid_from:=(now() AT TIME ZONE 'Europe/Berlin')::date;
  END IF;
  INSERT INTO public.animahost_knowledge_versions
   (tenant_id,id,version,area,title,content,source,active,valid_from,approved_at,approved_by,created_by)
  VALUES (p_tenant,p_id,p_expected+1,latest.area,latest.title,latest.content,latest.source,p_action='approve',latest.valid_from,
    CASE WHEN p_action<>'draft' THEN now() END,CASE WHEN p_action<>'draft' THEN p_actor END,p_actor)
  RETURNING * INTO latest;
  RETURN latest;
 END $body$;$ddl$;
 REVOKE ALL ON FUNCTION public.animahost_change_knowledge(uuid,uuid,integer,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_change_knowledge(uuid,uuid,integer,uuid,text,jsonb) TO service_role;

 EXECUTE $ddl$CREATE FUNCTION public.animahost_active_knowledge(p_tenant uuid,p_day date)
 RETURNS TABLE(id uuid,version integer,area text,title text,content text,source text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $body$
  SELECT effective.id,effective.version,effective.area,effective.title,effective.content,effective.source
  FROM (SELECT DISTINCT ON (item.id) item.* FROM public.animahost_knowledge_versions item
   WHERE item.tenant_id=p_tenant AND item.approved_at IS NOT NULL AND item.valid_from<=p_day
   ORDER BY item.id,item.version DESC) effective
  WHERE effective.active ORDER BY effective.area,effective.title,effective.id
 $body$;$ddl$;
 REVOKE ALL ON FUNCTION public.animahost_active_knowledge(uuid,date) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_active_knowledge(uuid,date) TO service_role;
END
$install$;
SELECT '103_animahost_orthodontic_knowledge.sql' AS dateiname,'eingespielt' AS status;
