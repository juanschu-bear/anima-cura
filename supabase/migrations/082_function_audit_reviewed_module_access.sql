-- Funktionsprüfung: geprüfte Modul-Funktionen anerkennen (13.11.2026).
-- Die Prüfung kannte bisher nur geprüfte Lesefunktionen mit Eigentümer postgres. Die Rechnungsfunktionen der Patienten-App
-- gehören bewusst dem Abrechnungsmodul, und den Klärfall zu Abrechnungspositionen löst bewusst der Leitstand. Das meldete die
-- Prüfung als Verstoß, Production Verify war deshalb seit dem 05.11. rot. Diese 7 Funktionen werden mit ihrem genauen
-- Fingerabdruck anerkannt (Stand Produktion 13.11.2026, Text abgeglichen mit 022, 027, 075 und 081). Ändert sich eine davon,
-- ist sie wieder ein Verstoß, bis sie erneut geprüft ist. Keine Daten und keine Rechte werden geändert.
BEGIN;
CREATE OR REPLACE FUNCTION public.function_acl_audit(p_module_role text DEFAULT 'abrechnung_runtime')
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $audit$
WITH reviewed_read_only(name,definition_md5) AS (VALUES
('ac_finanz_messwerte','058bc61c5972a5be492c4d084efb8819'),
('ac_norm','3b4e526ff7e40939d7bac9cbb8bc2cb8'),
('animahost_memory_read','5aaf98f0ae754c40f9d23575440ab095'),
('animasign_sync_status','fdfeba845636c46d2f75ed479bdba6da'),
('billing_protect_invoice','486b1fe0bd0721cc3b4b6b11a937a503'),
('billing_protect_payer_version','e689b873b34cc4d9172c6b2562b97a6f'),
('billing_protect_version','4e91496de7f02338ed82d5d45fb5a819'),
('doku_eintraege_guard','f23ed61daccd25432d4e91ae5bce508c'),
('doku_eintraege_no_delete','0d3b479bb8135aadddce0baee2af0ba4'),
('doku_versionen_immutable','8d2c73a6235658c864946bdec8ec9e1a'),
-- pg_catalog-only search_path qualifies its vector argument as public.vector.
('match_szenarien','4dd047461579d97314c5c6dacd51fde4'),
('protect_invoice_payment_allocation_history','bc08d46f52836cae7e942016f23b2e18'),
('protect_patient_payment_allocation_history','ac6b063c680905b0414c0a79d524641d'),
('reject_patient_merge_audit_mutation','0e6bef869412e9ba69e6f75f54a9194d'),
('treatment_immutable','fa70b632015a538e7267abb7bc2166ea'),
('validate_invoice_payment_allocation','0df4212af06e08bda1023503cb288f3e'),
('validate_patient_payment_allocation','919072cc8eb3fa97473edf45c9a93817')
),
-- Geprüfte Funktionen, die das Abrechnungsmodul bewusst ausführen darf (13.11.2026). Fingerabdruck, Eigentümer und
-- „nicht für anon“ müssen stimmen; öffentliche Ausführung bleibt immer ein Verstoß.
reviewed_module_access(name,definition_md5,owner) AS (VALUES
-- Rechnungen in der Patienten-App: gehören dem Modul (SECURITY DEFINER liest abrechnung.*), ausführbar nur für angemeldete Nutzer.
('patient_invoice_document_edition','35ce67e8e26efee5230531dc660f7f8f','abrechnung_runtime'),
('patient_invoice_document_editions','a25cc42a1a5d1a90d5ab152943b065b5','abrechnung_runtime'),
('patient_invoice_document_pdf','61e9be8e11f18e0446f430be53a9bea2','abrechnung_runtime'),
('patient_invoice_document_pdf_for_access','f73f7f7771eb1b4845ee9a5a74e2d6d7','abrechnung_runtime'),
('patient_invoice_documents','a2caf48d36f7564b079bcdb11571454d','abrechnung_runtime'),
('patient_invoice_documents_for_access','80153eab01a49870bb2252650b82e4d5','abrechnung_runtime'),
-- Klärfall zu Abrechnungspositionen: Der Leitstand löst ihn, deshalb ist diese eine Funktion dem Modul freigegeben.
('resolve_doku_position_clarification','c54fc983907214cef825d5663ef5b370','postgres')
),
module_role AS (SELECT oid,rolname,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=p_module_role),
routines AS (
 SELECT p.oid,p.proname,p.proowner,n.nspname,p.prokind,
 format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS signature,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
 EXISTS(SELECT 1 FROM module_role m WHERE has_function_privilege(m.oid,p.oid,'EXECUTE')) AS module_execute,
 EXISTS(SELECT 1 FROM reviewed_read_only safe WHERE safe.name=p.proname AND safe.definition_md5=md5(pg_get_functiondef(p.oid)) AND pg_get_userbyid(p.proowner)='postgres') AS reviewed_read_only,
 EXISTS(SELECT 1 FROM reviewed_module_access r WHERE r.name=p.proname AND r.definition_md5=md5(pg_get_functiondef(p.oid)) AND pg_get_userbyid(p.proowner)=r.owner
  AND NOT has_function_privilege('anon',p.oid,'EXECUTE')) AS reviewed_module_access
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
),
violations AS (
 SELECT signature, CASE WHEN public_execute THEN 'public_unreviewed_execution' ELSE 'module_unreviewed_execution' END AS reason
 FROM routines WHERE NOT reviewed_read_only AND (public_execute OR (module_execute AND NOT reviewed_module_access))
 UNION ALL
 SELECT rolname,'unsafe_module_role' FROM module_role m WHERE rolsuper OR rolbypassrls OR rolcreaterole
 OR has_schema_privilege(m.oid,'public','CREATE')
 OR EXISTS(SELECT 1 FROM pg_auth_members a WHERE a.member=m.oid)
),
creators AS (SELECT oid,rolname FROM pg_roles WHERE rolname IN ('postgres','supabase_admin') AND has_schema_privilege(oid,'public','CREATE')),
defaults AS (
 SELECT c.rolname AS creator,'global' AS scope,a.grantee,a.privilege_type FROM creators c
 LEFT JOIN pg_default_acl d ON d.defaclrole=c.oid AND d.defaclnamespace=0 AND d.defaclobjtype='f'
 CROSS JOIN LATERAL aclexplode(coalesce(d.defaclacl,acldefault('f',c.oid))) a
 UNION ALL
 SELECT c.rolname,'public',a.grantee,a.privilege_type FROM creators c JOIN pg_default_acl d ON d.defaclrole=c.oid AND d.defaclnamespace='public'::regnamespace AND d.defaclobjtype='f'
 CROSS JOIN LATERAL aclexplode(d.defaclacl) a
),
open_defaults AS (
 SELECT creator,scope,CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END AS grantee
 FROM defaults WHERE privilege_type='EXECUTE' AND (grantee=0 OR pg_get_userbyid(grantee) IN ('anon','authenticated','service_role'))
)
SELECT jsonb_build_object(
 'ok',NOT EXISTS(SELECT 1 FROM violations) AND NOT EXISTS(SELECT 1 FROM open_defaults WHERE creator='postgres'),
 'checked_at',now(),'module_role',p_module_role,'module_role_exists',EXISTS(SELECT 1 FROM module_role),
 'public_function_count',(SELECT count(*) FROM routines),
 'violations',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',signature,'reason',reason) ORDER BY signature) FROM violations),'[]'::jsonb),
 'default_violations',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY scope,grantee) FROM open_defaults o WHERE creator='postgres'),'[]'::jsonb),
 'platform_default_warnings',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY scope,grantee) FROM open_defaults o WHERE creator<>'postgres'),'[]'::jsonb)
);
$audit$;
REVOKE ALL ON FUNCTION public.function_acl_audit(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.function_acl_audit(text) TO service_role;
-- Fail closed: Nach dem Einspielen muss die Prüfung für das Abrechnungsmodul ohne Verstoß sein, sonst wird alles zurückgenommen.
DO $verify$
DECLARE audit jsonb := public.function_acl_audit('abrechnung_runtime');
BEGIN
  IF NOT (audit->>'ok')::boolean OR jsonb_array_length(audit->'violations')<>0 OR jsonb_array_length(audit->'default_violations')<>0 THEN
    RAISE EXCEPTION 'function_acl_audit_not_clean: %', audit->'violations';
  END IF;
END $verify$;
NOTIFY pgrst,'reload schema';
COMMIT;
