-- 104_animahost_knowledge_import.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.animahost_whatsapp_settings') IS NULL OR to_regclass('public.patient_access_memberships') IS NULL
    OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 104_animahost_knowledge_import.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 IF to_regclass('public.animahost_knowledge_versions') IS NULL THEN
  RAISE EXCEPTION 'Die Wissensablage fehlt. Bitte zuerst Migration 103 einspielen.';
 END IF;

 ALTER TABLE public.animahost_knowledge_versions
  DROP CONSTRAINT animahost_knowledge_versions_area_check,
  DROP CONSTRAINT animahost_knowledge_versions_source_check,
  ADD CONSTRAINT animahost_knowledge_versions_area_check
   CHECK (area IN ('apparatur','problem','selbsthilfe','warnzeichen','behandlungsphase','praxisablauf','begriff','gespraech')),
  ADD CONSTRAINT animahost_knowledge_versions_source_check CHECK (source IN ('fachlich','praxis','offen')),
  ADD COLUMN external_id text CHECK (external_id ~ '^[a-z0-9][a-z0-9_-]{0,99}$'),
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(metadata)='object'),
  ADD COLUMN imported_snapshot jsonb CHECK (jsonb_typeof(imported_snapshot)='object');

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_change_knowledge(p_tenant uuid,p_id uuid,p_expected integer,p_actor uuid,p_action text,p_entry jsonb)
 RETURNS public.animahost_knowledge_versions LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
 DECLARE latest public.animahost_knowledge_versions;
 BEGIN
  IF NOT EXISTS(SELECT FROM public.user_profiles WHERE id=p_actor AND role IN ('admin','verwaltung')) THEN
   RAISE EXCEPTION 'knowledge_actor_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('draft','approve','deactivate') OR p_id IS NULL OR p_tenant IS NULL OR p_expected IS NULL THEN
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
   latest.metadata:=coalesce(latest.metadata,'{}'::jsonb) ||
    (coalesce(p_entry,'{}'::jsonb)-ARRAY['area','title','content','source','validFrom','externalId','importVersion','importDate','sourceApprovalNote']);
  ELSIF p_action='deactivate' THEN
   latest.valid_from:=(now() AT TIME ZONE 'Europe/Berlin')::date;
  END IF;
  INSERT INTO public.animahost_knowledge_versions
   (tenant_id,id,version,area,title,content,source,active,valid_from,approved_at,approved_by,created_by,external_id,metadata)
  VALUES (p_tenant,p_id,p_expected+1,latest.area,latest.title,latest.content,latest.source,p_action='approve',latest.valid_from,
    CASE WHEN p_action<>'draft' THEN now() END,CASE WHEN p_action<>'draft' THEN p_actor END,p_actor,latest.external_id,latest.metadata)
  RETURNING * INTO latest;
  RETURN latest;
 END $body$;$ddl$;

 EXECUTE $ddl$CREATE FUNCTION public.animahost_import_knowledge(p_tenant uuid,p_actor uuid,p_entries jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$
 DECLARE item jsonb; item_id uuid; latest public.animahost_knowledge_versions; last_snapshot jsonb;
  created integer:=0; revised integer:=0; unchanged integer:=0;
 BEGIN
  IF NOT EXISTS(SELECT FROM public.user_profiles WHERE id=p_actor AND role IN ('admin','verwaltung')) THEN
   RAISE EXCEPTION 'knowledge_actor_forbidden' USING ERRCODE='42501';
  END IF;
  IF p_tenant IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
   RAISE EXCEPTION 'knowledge_import_invalid' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_entries) NOT BETWEEN 1 AND 500 OR
   (SELECT count(DISTINCT entry->>'externalId') FROM jsonb_array_elements(p_entries) entry)<>jsonb_array_length(p_entries) THEN
   RAISE EXCEPTION 'knowledge_import_invalid' USING ERRCODE='22023';
  END IF;
  FOR item IN SELECT entry FROM jsonb_array_elements(p_entries) entry ORDER BY entry->>'id' LOOP
   item_id:=(item->>'id')::uuid;
   IF item_id IS NULL OR (item->>'externalId') !~ '^[a-z0-9][a-z0-9_-]{0,99}$' THEN
    RAISE EXCEPTION 'knowledge_import_invalid' USING ERRCODE='22023';
   END IF;
   PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text||item_id::text,0));
   SELECT * INTO latest FROM public.animahost_knowledge_versions
    WHERE tenant_id=p_tenant AND id=item_id ORDER BY version DESC LIMIT 1;
   IF latest.version IS NOT NULL AND latest.external_id IS DISTINCT FROM item->>'externalId' THEN
    RAISE EXCEPTION 'knowledge_import_id_conflict' USING ERRCODE='23505';
   END IF;
   SELECT imported_snapshot INTO last_snapshot FROM public.animahost_knowledge_versions
    WHERE tenant_id=p_tenant AND id=item_id AND imported_snapshot IS NOT NULL ORDER BY version DESC LIMIT 1;
   IF last_snapshot=item THEN unchanged:=unchanged+1;
   ELSE
    INSERT INTO public.animahost_knowledge_versions
     (tenant_id,id,version,area,title,content,source,active,valid_from,created_by,external_id,metadata,imported_snapshot)
    VALUES (p_tenant,item_id,coalesce(latest.version,0)+1,item->>'area',item->>'title',item->>'content',item->>'source',false,
     (item->>'validFrom')::date,p_actor,item->>'externalId',item->'metadata',item);
    IF latest.version IS NULL THEN created:=created+1; ELSE revised:=revised+1; END IF;
   END IF;
  END LOOP;
  RETURN jsonb_build_object('created',created,'revised',revised,'unchanged',unchanged);
 END $body$;$ddl$;

 EXECUTE $ddl$CREATE FUNCTION public.animahost_active_knowledge_details(p_tenant uuid,p_day date)
 RETURNS TABLE(id uuid,version integer,area text,title text,content text,source text,guidance jsonb)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $body$
  SELECT effective.id,effective.version,effective.area,effective.title,effective.content,effective.source,
   coalesce(version_row.metadata->'guidance','{}'::jsonb)
  FROM public.animahost_active_knowledge(p_tenant,p_day) effective
  JOIN public.animahost_knowledge_versions version_row ON version_row.tenant_id=p_tenant
   AND version_row.id=effective.id AND version_row.version=effective.version
  ORDER BY effective.area,effective.title,effective.id
 $body$;$ddl$;

 EXECUTE $ddl$CREATE FUNCTION public.animahost_knowledge_open_questions(p_tenant uuid)
 RETURNS TABLE(id uuid, external_id text,version integer,area text,title text,question text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $body$
  SELECT latest.id,latest.external_id,latest.version,latest.area,latest.title,latest.metadata->>'openQuestion'
  FROM (SELECT DISTINCT ON (item.id) item.* FROM public.animahost_knowledge_versions item
    WHERE item.tenant_id=p_tenant ORDER BY item.id,item.version DESC) latest
  WHERE nullif(btrim(latest.metadata->>'openQuestion'),'') IS NOT NULL AND (latest.active OR latest.approved_at IS NULL)
  ORDER BY latest.area,latest.title,latest.id
 $body$;$ddl$;

 REVOKE ALL ON FUNCTION public.animahost_import_knowledge(uuid,uuid,jsonb),public.animahost_active_knowledge_details(uuid,date),
  public.animahost_knowledge_open_questions(uuid) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_import_knowledge(uuid,uuid,jsonb),public.animahost_active_knowledge_details(uuid,date),
  public.animahost_knowledge_open_questions(uuid) TO service_role;
END
$install$;
SELECT '104_animahost_knowledge_import.sql' AS dateiname,'eingespielt' AS status;
