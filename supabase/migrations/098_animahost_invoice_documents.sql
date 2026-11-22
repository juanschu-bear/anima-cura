-- 098_animahost_invoice_documents.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.patients') IS NULL OR to_regclass('public.animahost_whatsapp_chat_preferences') IS NULL
    OR to_regclass('abrechnung.active_patient_invoice_documents') IS NULL
    OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt oder 097 fehlt. 098_animahost_invoice_documents.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 IF current_user<>'postgres' OR has_schema_privilege('abrechnung_runtime','public','CREATE')
    OR NOT EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
      WHERE r.rolname='abrechnung_runtime' AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND m.grantor<>m.member)
    OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid=(SELECT oid FROM pg_roles WHERE rolname='abrechnung_runtime')
      AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND (m.inherit_option OR m.set_option OR m.grantor=m.member)) THEN
  RAISE EXCEPTION 'Die Installationsrechte für den Rechnungszugriff entsprechen nicht der Vorgabe.';
 END IF;
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH SET TRUE';
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH INHERIT FALSE';
 EXECUTE 'GRANT CREATE ON SCHEMA public TO abrechnung_runtime';

 EXECUTE $ddl$CREATE FUNCTION public.animahost_imported_invoice_documents(p_patient uuid,p_document uuid DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'date',d.fields->>'date','invoiceNumber',d.fields->>'invoiceNumber',
  'content',CASE WHEN p_document IS NOT NULL AND octet_length(d.content) <= 12582912 THEN encode(d.content,'base64') END)
  ORDER BY d.fields->>'date' DESC,d.id),'[]'::jsonb)
 FROM (SELECT a.id,a.fields,a.content FROM abrechnung.active_patient_invoice_documents a
  WHERE a.patient_id=p_patient AND (p_document IS NULL OR p_document=a.id)
   AND octet_length(a.content)>0
   AND NOT (coalesce(a.fields->'warnings','[]'::jsonb) ? 'cancellation_document_requires_review')
  ORDER BY a.fields->>'date' DESC,a.id LIMIT 51) d
 $f$;$ddl$;
 REVOKE ALL ON FUNCTION public.animahost_imported_invoice_documents(uuid,uuid) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_imported_invoice_documents(uuid,uuid) TO service_role;
 ALTER FUNCTION public.animahost_imported_invoice_documents(uuid,uuid) OWNER TO abrechnung_runtime;

 EXECUTE 'REVOKE CREATE ON SCHEMA public FROM abrechnung_runtime';
 EXECUTE 'REVOKE abrechnung_runtime FROM CURRENT_USER GRANTED BY CURRENT_USER';
 IF has_schema_privilege('abrechnung_runtime','public','CREATE')
    OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.roleid=(SELECT oid FROM pg_roles WHERE rolname='abrechnung_runtime')
      AND m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user) AND (m.inherit_option OR m.set_option OR m.grantor=m.member)) THEN
  RAISE EXCEPTION 'Temporäre Installationsrechte wurden nicht vollständig entfernt.';
 END IF;
END
$install$;
SELECT '098_animahost_invoice_documents.sql eingespielt' AS ergebnis;
