-- 101_invoice_portal_pdf_lookup.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
DECLARE install_role text:=current_user;
 audit_definition text;
 old_fingerprints text[]:=ARRAY['f8d1f698658fe32bbc606b8abd5358b7','b620d6edd399b153769fabc6542a8973','77212fcd5b8a7012691a9779bfcf59f3'];
 functions regprocedure[]:=ARRAY[to_regprocedure('public.patient_invoice_document_edition(uuid,boolean)'),
  to_regprocedure('public.patient_invoice_document_editions()'),
  to_regprocedure('public.invoice_portal_delivery_preflight(jsonb)')];
BEGIN
 IF to_regclass('public.patient_access_memberships') IS NULL
    OR to_regclass('abrechnung.active_patient_invoice_documents') IS NULL
    OR to_regprocedure('public.invoice_portal_delivery_preflight(jsonb)') IS NULL
    OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt oder 099 fehlt. Diese Datei gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
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
 SELECT pg_get_functiondef(to_regprocedure('public.function_acl_audit(text)')) INTO audit_definition;
 FOR i IN 1..array_length(functions,1) LOOP
  IF audit_definition IS NULL OR functions[i] IS NULL
     OR md5(pg_get_functiondef(functions[i]))<>old_fingerprints[i]
     OR position(quote_literal(old_fingerprints[i]) IN audit_definition)=0 THEN
   RAISE EXCEPTION 'Rechnungs-Funktionsaudit fehlt oder der geprüfte Stand aus 100 weicht ab.';
  END IF;
 END LOOP;
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH SET TRUE';
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH INHERIT FALSE';
 EXECUTE 'GRANT CREATE ON SCHEMA public TO abrechnung_runtime';
 EXECUTE 'SET LOCAL ROLE abrechnung_runtime';

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
  LEFT JOIN LATERAL (
   SELECT e.content FROM abrechnung.verified_invoice_editions e WHERE e.part_id=d.id LIMIT 1
  ) v ON true
  LEFT JOIN LATERAL(SELECT enabled FROM abrechnung.invoice_edition_settings ORDER BY revision DESC LIMIT 1) s ON true
  WHERE d.id=document_id;
  RETURN result;
 END
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
  LEFT JOIN LATERAL (
   SELECT e.content FROM abrechnung.verified_invoice_editions e WHERE e.part_id=d.id LIMIT 1
  ) v ON true
  LEFT JOIN LATERAL(SELECT enabled FROM abrechnung.invoice_edition_settings ORDER BY revision DESC LIMIT 1) s ON true;
  RETURN result;
 END
 $f$;
 $ddl$;

 EXECUTE $ddl$
 CREATE OR REPLACE FUNCTION public.invoice_portal_delivery_preflight(targets jsonb)
 RETURNS TABLE(account_id uuid,patient_id uuid,document_id uuid,status text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $f$
  WITH requested AS MATERIALIZED(
   SELECT DISTINCT target.account_id,target.patient_id,target.document_id
   FROM jsonb_to_recordset(targets) AS target(account_id uuid,patient_id uuid,document_id uuid)
  ), documents AS MATERIALIZED(
   SELECT d.id,d.patient_id,
    CASE WHEN substring(d.content,1,5)=convert_to('%PDF-','UTF8') THEN true
         WHEN coalesce(s.enabled,false) THEN EXISTS(
          SELECT FROM abrechnung.verified_invoice_editions v
          WHERE v.part_id=d.id AND substring(v.content,1,5)=convert_to('%PDF-','UTF8')
         )
         ELSE false END AS usable
   FROM abrechnung.active_patient_invoice_documents d
   JOIN (SELECT DISTINCT r.document_id FROM requested r) t ON t.document_id=d.id
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

 EXECUTE format('SET LOCAL ROLE %I',install_role);
 FOR i IN 1..array_length(functions,1) LOOP
  audit_definition:=replace(audit_definition,quote_literal(old_fingerprints[i]),quote_literal(md5(pg_get_functiondef(functions[i]))));
 END LOOP;
 EXECUTE audit_definition;
 EXECUTE 'REVOKE CREATE ON SCHEMA public FROM abrechnung_runtime';
 EXECUTE 'REVOKE abrechnung_runtime FROM CURRENT_USER GRANTED BY CURRENT_USER';
 IF has_schema_privilege('abrechnung_runtime','public','CREATE') OR EXISTS (
   SELECT FROM pg_auth_members m WHERE m.roleid='abrechnung_runtime'::regrole AND m.member=current_user::regrole
    AND (m.inherit_option OR m.set_option OR m.grantor=m.member)
 ) THEN RAISE EXCEPTION 'Temporäre Installationsrechte wurden nicht vollständig entfernt.';
 END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(public.function_acl_audit()->'violations') v
  WHERE v->>'signature' LIKE 'public.patient_invoice_%' OR v->>'signature' LIKE 'public.invoice_portal_%'
  OR v->>'signature' LIKE 'public.animahost%invoice%') THEN
  RAISE EXCEPTION 'Rechnungsfunktionen bestehen den Audit nicht.';
 END IF;
END
$install$;
SELECT '101_invoice_portal_pdf_lookup.sql' AS datei,'eingespielt' AS status;
