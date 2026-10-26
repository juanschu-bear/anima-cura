-- Fail-closed function access audit and explicit defaults for application migrations.
-- PostgreSQL global defaults must be revoked globally; schema-local REVOKE cannot subtract them.
-- Managed supabase_admin defaults are inventoried as warnings, not silently changed (42501 with project role).
BEGIN;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;
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
module_role AS (SELECT oid,rolname,rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=p_module_role),
routines AS (
 SELECT p.oid,p.proname,p.proowner,n.nspname,p.prokind,
 format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS signature,
 EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
 EXISTS(SELECT 1 FROM module_role m WHERE has_function_privilege(m.oid,p.oid,'EXECUTE')) AS module_execute,
 EXISTS(SELECT 1 FROM reviewed_read_only safe WHERE safe.name=p.proname AND safe.definition_md5=md5(pg_get_functiondef(p.oid)) AND pg_get_userbyid(p.proowner)='postgres') AS reviewed_read_only
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind IN ('f','p') AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
),
violations AS (
 SELECT signature, CASE WHEN public_execute THEN 'public_unreviewed_execution' ELSE 'module_unreviewed_execution' END AS reason
 FROM routines WHERE NOT reviewed_read_only AND (public_execute OR module_execute)
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
NOTIFY pgrst,'reload schema';
COMMIT;
