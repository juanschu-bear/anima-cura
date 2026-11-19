-- 090_animahost_whatsapp_notice_templates.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
-- Die Vorlagen wurden am 19.11.2026 bereits unter der kollidierenden Nummer 088 eingespielt.
-- Ein erneuter Lauf prüft den vorhandenen Stand und legt nichts doppelt an.
DO $install$
BEGIN
 IF to_regclass('public.patients') IS NULL OR
    to_regclass('public.animahost_whatsapp_settings') IS NULL OR
    to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 090_animahost_whatsapp_notice_templates.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 IF to_regclass('public.animahost_whatsapp_notice_template_versions') IS NOT NULL THEN
  IF to_regprocedure('public.animahost_publish_notice_template(uuid,uuid,integer,text,text,text,boolean,uuid)') IS NULL OR
     NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.animahost_whatsapp_notice_template_versions'::regclass
       AND tgname='animahost_notice_template_immutable' AND NOT tgisinternal) THEN
   RAISE EXCEPTION 'Die Mitteilungsvorlagen sind nur teilweise vorhanden; bitte den Datenbankstand prüfen.';
  END IF;
 ELSE
 CREATE TABLE public.animahost_whatsapp_notice_template_versions (
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  template_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),
  kind text NOT NULL CHECK(kind ~ '^[a-z][a-z0-9_]{1,63}$'),
  title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  body_template text NOT NULL CHECK(length(trim(body_template)) BETWEEN 1 AND 1200),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,template_id,version)
 );
 CREATE INDEX animahost_notice_templates_latest
  ON public.animahost_whatsapp_notice_template_versions(tenant_id,template_id,version DESC);
 CREATE TRIGGER animahost_notice_template_immutable
  BEFORE UPDATE OR DELETE ON public.animahost_whatsapp_notice_template_versions
  FOR EACH ROW EXECUTE FUNCTION public.animahost_whatsapp_immutable();
 ALTER TABLE public.animahost_whatsapp_notice_template_versions ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_whatsapp_notice_template_versions FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT ON public.animahost_whatsapp_notice_template_versions TO service_role;

 EXECUTE $ddl$CREATE FUNCTION public.animahost_publish_notice_template(
   p_tenant uuid,p_template uuid,p_expected integer,p_kind text,p_title text,
   p_body text,p_active boolean,p_actor uuid)
  RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $body$
  DECLARE latest integer; next_version integer;
  BEGIN
   PERFORM 1 FROM public.animahost_whatsapp_settings WHERE tenant_id=p_tenant FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'animahost_tenant_not_found'; END IF;
   SELECT MAX(version) INTO latest FROM public.animahost_whatsapp_notice_template_versions
    WHERE tenant_id=p_tenant AND template_id=p_template;
   IF latest IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'notice_template_stale'; END IF;
   IF p_kind !~ '^[a-z][a-z0-9_]{1,63}$' OR length(trim(p_title)) NOT BETWEEN 1 AND 120 OR
      length(trim(p_body)) NOT BETWEEN 1 AND 1200 OR p_actor IS NULL THEN
    RAISE EXCEPTION 'notice_template_invalid'; END IF;
   next_version:=COALESCE(latest,0)+1;
   INSERT INTO public.animahost_whatsapp_notice_template_versions
    (tenant_id,template_id,version,kind,title,body_template,active,created_by)
   VALUES(p_tenant,p_template,next_version,p_kind,p_title,p_body,p_active,p_actor);
   RETURN next_version;
  END $body$;$ddl$;
 REVOKE ALL ON FUNCTION public.animahost_publish_notice_template(uuid,uuid,integer,text,text,text,boolean,uuid)
  FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_publish_notice_template(uuid,uuid,integer,text,text,text,boolean,uuid)
  TO service_role;
 END IF;
END
$install$;
SELECT '090_animahost_whatsapp_notice_templates.sql eingespielt' AS ergebnis;
