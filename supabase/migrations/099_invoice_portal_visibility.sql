-- 099_invoice_portal_visibility.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
DECLARE install_role text:=current_user;
BEGIN
 IF to_regclass('public.patient_access_memberships') IS NULL
    OR to_regclass('abrechnung.active_patient_invoice_documents') IS NULL
    OR to_regprocedure('public.animahost_imported_invoice_documents(uuid,uuid)') IS NULL
    OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt oder 098 fehlt. Diese Datei gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 IF current_user<>'postgres' OR has_schema_privilege('abrechnung_runtime','public','CREATE')
    OR NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
      WHERE r.rolname='abrechnung_runtime' AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND m.grantor<>m.member)
    OR EXISTS (SELECT 1 FROM pg_auth_members m
      WHERE m.roleid='abrechnung_runtime'::regrole AND m.member=current_user::regrole
      AND (m.inherit_option OR m.set_option OR m.grantor=m.member)) THEN
  RAISE EXCEPTION 'Die Installationsrechte für den Rechnungszugriff entsprechen nicht der Vorgabe.';
 END IF;
 -- The app's existing owner cannot read RLS-protected profile or contact tables directly.
 CREATE VIEW abrechnung.source_invoice_portal_memberships AS
  SELECT user_id,patient_id FROM public.patient_access_memberships;
 CREATE VIEW abrechnung.source_invoice_portal_contacts AS
  SELECT normalized_email,auth_user_id FROM public.invoice_access_contacts WHERE auth_user_id IS NOT NULL;
 REVOKE ALL ON abrechnung.source_invoice_portal_memberships,abrechnung.source_invoice_portal_contacts FROM PUBLIC,anon,authenticated,service_role;
 GRANT SELECT ON abrechnung.source_invoice_portal_memberships,abrechnung.source_invoice_portal_contacts TO abrechnung_runtime;
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH SET TRUE';
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH INHERIT FALSE';
 EXECUTE 'GRANT CREATE ON SCHEMA public TO abrechnung_runtime';
 EXECUTE 'SET LOCAL ROLE abrechnung_runtime';

 EXECUTE $ddl$
 CREATE FUNCTION public.invoice_portal_jwt_uid()
 RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $f$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
   nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
 $f$;
 $ddl$;
 REVOKE ALL ON FUNCTION public.invoice_portal_jwt_uid() FROM PUBLIC,anon,authenticated,service_role;

 EXECUTE $ddl$
 CREATE FUNCTION public.invoice_portal_patient_scope(account_id uuid)
 RETURNS TABLE(patient_id uuid)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $f$
  WITH profile AS (
   SELECT p.id,p.patient_id
   FROM abrechnung.source_user_profiles p
   WHERE p.id=account_id AND p.role='patient' AND p.patient_id IS NOT NULL
  )
  SELECT p.patient_id FROM profile p
  UNION
  SELECT m.patient_id FROM abrechnung.source_invoice_portal_memberships m JOIN profile p ON p.id=m.user_id
 $f$;
 $ddl$;
 REVOKE ALL ON FUNCTION public.invoice_portal_patient_scope(uuid) FROM PUBLIC,anon,authenticated,service_role;

 EXECUTE $ddl$
 CREATE FUNCTION public.invoice_portal_selected_pdf(original bytea,typeset bytea,enabled boolean)
 RETURNS bytea
 LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $f$
  SELECT CASE WHEN enabled AND substring(typeset,1,5)=convert_to('%PDF-','UTF8') THEN typeset
              WHEN substring(original,1,5)=convert_to('%PDF-','UTF8') THEN original END
 $f$;
 $ddl$;
 REVOKE ALL ON FUNCTION public.invoice_portal_selected_pdf(bytea,bytea,boolean) FROM PUBLIC,anon,authenticated,service_role;

 EXECUTE $ddl$
 CREATE OR REPLACE FUNCTION public.patient_invoice_documents_for_access()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 DECLARE result jsonb;
 BEGIN
  IF NOT EXISTS(SELECT FROM public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid())) THEN
   RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'invoiceNumber',d.fields->>'invoiceNumber','date',d.fields->>'date',
   'reference',d.fields->'ivoris'->>'reference','quarter',d.fields->>'quarter',
   'art',d.fields->'ivoris'->>'art','patientCents',d.fields->'patientCents','grossCents',d.fields->'grossCents',
   'positions',d.fields->'ivoris'->'lines','reasons',d.fields->'ivoris'->'reasons','patientId',d.patient_id
  ) ORDER BY d.fields->>'date' DESC,d.id),'[]'::jsonb)
  INTO result FROM abrechnung.active_patient_invoice_documents d
  JOIN public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid()) scope ON scope.patient_id=d.patient_id;
  RETURN result;
 END
 $f$;
 $ddl$;

 EXECUTE $ddl$
 CREATE OR REPLACE FUNCTION public.patient_invoice_document_edition(document_id uuid, original_only boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 DECLARE result jsonb;
 BEGIN
  IF NOT EXISTS(SELECT FROM public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid())) THEN
   RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT jsonb_build_object(
   'edition',CASE WHEN NOT original_only AND s.enabled AND substring(v.content,1,5)=convert_to('%PDF-','UTF8')
                   THEN 'typeset' ELSE 'original' END,
   'pdf',encode(public.invoice_portal_selected_pdf(d.content,v.content,coalesce(s.enabled,false) AND NOT original_only),'base64')
  ) INTO result
  FROM abrechnung.active_patient_invoice_documents d
  JOIN public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid()) scope ON scope.patient_id=d.patient_id
  LEFT JOIN abrechnung.verified_invoice_editions v ON v.part_id=d.id
  LEFT JOIN LATERAL(SELECT enabled FROM abrechnung.invoice_edition_settings ORDER BY revision DESC LIMIT 1) s ON true
  WHERE d.id=document_id;
  RETURN result;
 END
 $f$;
 $ddl$;

 EXECUTE $ddl$
 CREATE OR REPLACE FUNCTION public.patient_invoice_document_pdf(document_id uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 DECLARE result text;
 BEGIN
  IF NOT EXISTS(SELECT FROM public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid())) THEN
   RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT encode(public.invoice_portal_selected_pdf(d.content,NULL,false),'base64') INTO result
  FROM abrechnung.active_patient_invoice_documents d
  JOIN public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid()) scope ON scope.patient_id=d.patient_id
  WHERE d.id=document_id;
  RETURN result;
 END
 $f$;
 $ddl$;

 EXECUTE $ddl$
 CREATE OR REPLACE FUNCTION public.patient_invoice_document_pdf_for_access(document_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
  SELECT public.patient_invoice_document_pdf(document_id)
 $f$;
 $ddl$;

 EXECUTE $ddl$
 CREATE OR REPLACE FUNCTION public.patient_invoice_document_editions()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 DECLARE result jsonb;
 BEGIN
  IF NOT EXISTS(SELECT FROM public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid())) THEN
   RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'patientId',d.patient_id,
   'typesetAvailable',coalesce(substring(v.content,1,5)=convert_to('%PDF-','UTF8'),false),
   'delivered',CASE WHEN coalesce(s.enabled,false) AND substring(v.content,1,5)=convert_to('%PDF-','UTF8') THEN 'typeset' ELSE 'original' END
  ) ORDER BY d.fields->>'date' DESC,d.id),'[]'::jsonb)
  INTO result FROM abrechnung.active_patient_invoice_documents d
  JOIN public.invoice_portal_patient_scope(public.invoice_portal_jwt_uid()) scope ON scope.patient_id=d.patient_id
  LEFT JOIN abrechnung.verified_invoice_editions v ON v.part_id=d.id
  LEFT JOIN LATERAL(SELECT enabled FROM abrechnung.invoice_edition_settings ORDER BY revision DESC LIMIT 1) s ON true;
  RETURN result;
 END
 $f$;
 $ddl$;

 EXECUTE $ddl$
 CREATE FUNCTION public.invoice_portal_delivery_preflight(targets jsonb)
 RETURNS TABLE(account_id uuid,patient_id uuid,document_id uuid,status text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $f$
  WITH requested AS MATERIALIZED(
   SELECT DISTINCT target.account_id,target.patient_id,target.document_id
   FROM jsonb_to_recordset(targets) AS target(account_id uuid,patient_id uuid,document_id uuid)
  ), documents AS MATERIALIZED(
   SELECT d.id,d.patient_id,
    public.invoice_portal_selected_pdf(d.content,v.content,coalesce(s.enabled,false)) IS NOT NULL AS usable
   FROM abrechnung.active_patient_invoice_documents d
   JOIN (SELECT DISTINCT r.document_id FROM requested r) t ON t.document_id=d.id
   LEFT JOIN abrechnung.verified_invoice_editions v ON v.part_id=d.id
   LEFT JOIN LATERAL(SELECT enabled FROM abrechnung.invoice_edition_settings ORDER BY revision DESC LIMIT 1) s ON true
  )
  SELECT r.account_id,r.patient_id,r.document_id,
   CASE WHEN r.account_id IS NULL THEN 'no_account'
        WHEN NOT EXISTS(SELECT FROM public.invoice_portal_patient_scope(r.account_id) scope WHERE scope.patient_id=r.patient_id)
             THEN 'account_scope_mismatch'
        WHEN d.id IS NULL THEN 'document_inactive'
        WHEN NOT d.usable THEN 'pdf_unavailable'
        ELSE 'visible' END
  FROM requested r LEFT JOIN documents d ON d.id=r.document_id AND d.patient_id=r.patient_id
 $f$;
 $ddl$;
 REVOKE ALL ON FUNCTION public.invoice_portal_delivery_preflight(jsonb) FROM PUBLIC,anon,authenticated,service_role;

 EXECUTE $ddl$
 CREATE FUNCTION public.animahost_invoice_portal_visibility(p_patient uuid,p_from date,p_through date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
  WITH accounts AS MATERIALIZED(
   SELECT p.id FROM abrechnung.source_user_profiles p WHERE p.role='patient' AND p.patient_id IS NOT NULL AND (
    p.patient_id=p_patient OR EXISTS(SELECT FROM abrechnung.source_invoice_portal_memberships m WHERE m.user_id=p.id AND m.patient_id=p_patient)
   )
  ), matching AS MATERIALIZED(
   SELECT d.id,d.fields->>'date' AS date
   FROM abrechnung.active_patient_invoice_documents d
   WHERE d.patient_id=p_patient AND d.fields->>'date' ~ '^\d{4}-\d{2}-\d{2}$'
    AND (p_from IS NULL OR d.fields->>'date'>=p_from::text)
    AND (p_through IS NULL OR d.fields->>'date'<=p_through::text)
    AND NOT (coalesce(d.fields->'warnings','[]'::jsonb) ? 'cancellation_document_requires_review')
   ORDER BY d.fields->>'date' DESC,d.id LIMIT 2
  ), evidence AS (
   SELECT m.date FROM matching m CROSS JOIN accounts a
   WHERE (SELECT count(*) FROM accounts)=1
   AND (SELECT count(*) FROM matching x WHERE x.date=m.date)=1
   AND m.id=(SELECT id FROM matching LIMIT 1)
   AND EXISTS(SELECT FROM public.invoice_portal_delivery_preflight(
    jsonb_build_array(jsonb_build_object('account_id',a.id,'patient_id',p_patient,'document_id',m.id))) p WHERE p.status='visible')
  )
  SELECT coalesce((SELECT jsonb_build_object('cause','already_available','invoiceDate',e.date) FROM evidence e),
   jsonb_build_object('cause','manual_review','invoiceDate',NULL))
 $f$;
 $ddl$;
 REVOKE ALL ON FUNCTION public.animahost_invoice_portal_visibility(uuid,date,date) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_invoice_portal_visibility(uuid,date,date) TO service_role;

 EXECUTE format('SET LOCAL ROLE %I',install_role);
 EXECUTE 'REVOKE CREATE ON SCHEMA public FROM abrechnung_runtime';
 EXECUTE 'REVOKE abrechnung_runtime FROM CURRENT_USER GRANTED BY CURRENT_USER';
 IF has_schema_privilege('abrechnung_runtime','public','CREATE') OR EXISTS (
   SELECT FROM pg_auth_members m WHERE m.roleid='abrechnung_runtime'::regrole AND m.member=current_user::regrole
    AND (m.inherit_option OR m.set_option OR m.grantor=m.member)
 ) THEN RAISE EXCEPTION 'Temporäre Installationsrechte wurden nicht vollständig entfernt.';
 END IF;
END
$install$;
SELECT '099_invoice_portal_visibility.sql' AS datei,'eingespielt' AS status;
