-- Catalog-only check: never invokes the application RPCs under test.
BEGIN;
CREATE OR REPLACE FUNCTION public.rpc_permissions_audit(p_requirements jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $audit$
WITH requirements AS (
 SELECT x->>'name' AS name,x->>'signature' AS signature,x->>'role' AS role,x->>'file' AS file
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_requirements)='array' THEN p_requirements ELSE '[]'::jsonb END) x
), checked AS (
 SELECT r.*,p.oid AS function_oid,roles.oid AS role_oid,
 EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=roles.oid AND a.privilege_type='EXECUTE') AS explicit_execute,
 CASE WHEN p.oid IS NOT NULL AND roles.oid IS NOT NULL THEN has_function_privilege(roles.oid,p.oid,'EXECUTE') AND has_schema_privilege(roles.oid,p.pronamespace,'USAGE') ELSE false END AS effective_execute
 FROM requirements r LEFT JOIN pg_roles roles ON roles.rolname=r.role
 LEFT JOIN pg_proc p ON p.pronamespace='public'::regnamespace AND p.prokind='f'
 AND p.proname=r.name AND format('public.%I(%s)',p.proname,pg_get_function_identity_arguments(p.oid))=r.signature
), violations AS (
 SELECT name,signature,role,file,CASE WHEN role_oid IS NULL THEN 'role_missing' WHEN function_oid IS NULL THEN 'function_missing_or_signature_changed' WHEN NOT explicit_execute THEN 'explicit_execute_missing' ELSE 'schema_or_effective_execute_missing' END AS reason
 FROM checked WHERE function_oid IS NULL OR role_oid IS NULL OR NOT explicit_execute OR NOT effective_execute
)
SELECT jsonb_build_object('ok',jsonb_typeof(p_requirements)='array' AND (SELECT count(*) FROM requirements)>0 AND NOT EXISTS(SELECT 1 FROM violations),
 'checked',(SELECT count(*) FROM requirements),'violations',coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM violations v),'[]'::jsonb));
$audit$;
REVOKE ALL ON FUNCTION public.rpc_permissions_audit(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_permissions_audit(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
