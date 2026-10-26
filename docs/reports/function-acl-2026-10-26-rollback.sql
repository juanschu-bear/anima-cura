-- Project zymqxzhjbcxzhzvjqvbv. ACL changes ONLY. No patient writes, trigger changes or job runs.
-- UNDO: restores original grants and grant options from functions-before.json.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $acl_preflight$ DECLARE p pg_proc%ROWTYPE; BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=24189::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3ce756e4f402940c204bfa8c0ba6916f'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: abgleich_patient_aus_submission';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19690::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3903a7778be1c7c59e189eabd656bd37'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_import_ivoris_plaene';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20604::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'c09623a34188ac2661e7d63a5a5e4d1b'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_iban';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20616::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'d49b4ee5e380aeb7d8608ca66cdf28ce'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_kette';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20559::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'885438df71fd2d69fe91299117bb921f'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_namen_im_zweck';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19671::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'2b104639f0ec00590c40f22122921db1'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_names';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19744::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'ba51f06ff96d9e8739ec6cb6d1cd550c'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_names_v2';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19864::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'c0cdcf6b0f5ed6033257a6e6fdd4fa55'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_referenz';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19760::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'5379152cc8dcb96dbf8f7b832b27f810'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_typos';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19677::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'816291c74b6d24d8b896e3276aa39fc3'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_rekonstruiere_plaene';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25797::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'08f9b989c45e218b4349d9edd6b8d0fe'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: animahost_memory_write';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25146::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'85c8ced6f70038051f9d3bfc6680a30a'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: auto_patient_profile';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39452::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'2dfc2c139e7cb3b6c86769f1e1c2cb48'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: claim_integration_outbox_job';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39485::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'1484788b640402215218b4931f04e494'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: claim_integration_outbox_job_for_artifact';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=27643::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'13034ac1162aef30089684cc405cd4d6'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: doku_baustein_nutzung_erhoehen';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19995::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'ac851cae1772738eccacb9fa806e8593'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: kassen_beleg_nr';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48339::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'035ed634e75fec328075c63365a8e47f'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ledger_record_practice_payment';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=17755::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3cbfd727642c2bf790cc4a6925f7b25b'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: mark_overdue_rates';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48916::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'760ff612bd74ef558d1ef55c7ae9e7a3'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: merge_duplicate_patient_with_ivoris_alias';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48917::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'d335e6d21472e0cd36e505c2f3f31f8d'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: merge_local_patient_duplicate';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39341::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'b34758e60ac277660e531e8e02d226d5'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: merge_patient_into_canonical';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25330::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'747fade9486aa64ced3800b12c719644'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: patient_checkin';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20461::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'d6a9a94eb571bba4772907df552185e4'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: praxis_pass_touch';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39613::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'385099f70f41f042bc294442e4012880'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: record_integration_outbox_event';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39640::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'604a911de9b47e7a7514ed865c928d31'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: resolve_scribe_patient_atomic';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39429::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'0d8e90027e32ea463ccb68119fc3bb8d'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: sync_animasign_outbox_jobs';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39431::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3f8c0e10e76f2f040291afe89086d693'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: sync_scribe_outbox_job';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25331::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'9967151cffaa194aff16cb75db5d4157'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: tagesplan_status_update';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25323::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'2caaf3a205326caca6ebb9b975509f01'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: update_tagesplan_updated_at';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=17751::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'463de825ab5cc45c0e77d827c39ae9ac'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: update_updated_at';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48341::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'db28234e315a87e4e534a7fd833ecf20'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: void_kassen_zahlung';
 END IF;
END $acl_preflight$;
GRANT EXECUTE ON FUNCTION public.abgleich_patient_aus_submission(p_submission_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.abgleich_patient_aus_submission(p_submission_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public.abgleich_patient_aus_submission(p_submission_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_import_ivoris_plaene() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_import_ivoris_plaene() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_import_ivoris_plaene() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_import_ivoris_plaene() TO "service_role";
GRANT EXECUTE ON FUNCTION public.ac_match_iban() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_match_iban() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_match_iban() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_match_iban() TO "service_role";
GRANT EXECUTE ON FUNCTION public.ac_match_kette() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_match_kette() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_match_kette() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_match_kette() TO "service_role";
GRANT EXECUTE ON FUNCTION public.ac_match_namen_im_zweck() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_match_namen_im_zweck() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_match_namen_im_zweck() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_match_namen_im_zweck() TO "service_role";
GRANT EXECUTE ON FUNCTION public.ac_match_names(von date, bis date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_match_names(von date, bis date) TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_match_names(von date, bis date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_match_names_v2() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_match_names_v2() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_match_names_v2() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_match_referenz() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_match_referenz() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_match_referenz() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_match_typos() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_match_typos() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_match_typos() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_rekonstruiere_plaene() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.ac_rekonstruiere_plaene() TO "anon";
GRANT EXECUTE ON FUNCTION public.ac_rekonstruiere_plaene() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ac_rekonstruiere_plaene() TO "service_role";
GRANT EXECUTE ON FUNCTION public.animahost_memory_write(p_patient_id uuid, p_patient_name text, p_zusammenfassung text, p_offene_themen text[], p_stimmung text, p_praeferenz_updates text[], p_kommunikationsstil text, p_familie_kontext text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.animahost_memory_write(p_patient_id uuid, p_patient_name text, p_zusammenfassung text, p_offene_themen text[], p_stimmung text, p_praeferenz_updates text[], p_kommunikationsstil text, p_familie_kontext text) TO "anon";
GRANT EXECUTE ON FUNCTION public.animahost_memory_write(p_patient_id uuid, p_patient_name text, p_zusammenfassung text, p_offene_themen text[], p_stimmung text, p_praeferenz_updates text[], p_kommunikationsstil text, p_familie_kontext text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.auto_patient_profile() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_patient_profile() TO "anon";
GRANT EXECUTE ON FUNCTION public.auto_patient_profile() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.auto_patient_profile() TO "service_role";
GRANT EXECUTE ON FUNCTION public.claim_integration_outbox_job(p_artifact_type text, p_worker_id text, p_lease_minutes integer) TO "anon";
GRANT EXECUTE ON FUNCTION public.claim_integration_outbox_job_for_artifact(p_artifact_type text, p_artifact_id uuid, p_worker_id text, p_lease_minutes integer, p_force boolean) TO "anon";
GRANT EXECUTE ON FUNCTION public.doku_baustein_nutzung_erhoehen(p_behandlungsart text, p_termin_typ text, p_gruppe text, p_option_text text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.doku_baustein_nutzung_erhoehen(p_behandlungsart text, p_termin_typ text, p_gruppe text, p_option_text text) TO "anon";
GRANT EXECUTE ON FUNCTION public.doku_baustein_nutzung_erhoehen(p_behandlungsart text, p_termin_typ text, p_gruppe text, p_option_text text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.doku_baustein_nutzung_erhoehen(p_behandlungsart text, p_termin_typ text, p_gruppe text, p_option_text text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.kassen_beleg_nr() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.kassen_beleg_nr() TO "anon";
GRANT EXECUTE ON FUNCTION public.kassen_beleg_nr() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.ledger_record_practice_payment() TO "anon";
GRANT EXECUTE ON FUNCTION public.ledger_record_practice_payment() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.mark_overdue_rates() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_overdue_rates() TO "anon";
GRANT EXECUTE ON FUNCTION public.mark_overdue_rates() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.mark_overdue_rates() TO "service_role";
GRANT EXECUTE ON FUNCTION public.merge_duplicate_patient_with_ivoris_alias(p_source_patient_id uuid, p_target_patient_id uuid, p_reason text) TO "anon";
GRANT EXECUTE ON FUNCTION public.merge_local_patient_duplicate(p_source_patient_id uuid, p_target_patient_id uuid, p_reason text) TO "anon";
GRANT EXECUTE ON FUNCTION public.merge_patient_into_canonical(p_source_patient_id uuid, p_target_patient_id uuid, p_reason text) TO "anon";
GRANT EXECUTE ON FUNCTION public.merge_patient_into_canonical(p_source_patient_id uuid, p_target_patient_id uuid, p_reason text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.patient_checkin(p_termin_id uuid, p_via text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_checkin(p_termin_id uuid, p_via text) TO "anon";
GRANT EXECUTE ON FUNCTION public.praxis_pass_touch() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.praxis_pass_touch() TO "anon";
GRANT EXECUTE ON FUNCTION public.praxis_pass_touch() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.record_integration_outbox_event() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_integration_outbox_event() TO "anon";
GRANT EXECUTE ON FUNCTION public.record_integration_outbox_event() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.resolve_scribe_patient_atomic(p_entry_id uuid, p_patient_id uuid, p_resolved_by uuid) TO "anon";
GRANT EXECUTE ON FUNCTION public.sync_animasign_outbox_jobs() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_animasign_outbox_jobs() TO "anon";
GRANT EXECUTE ON FUNCTION public.sync_animasign_outbox_jobs() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.sync_scribe_outbox_job() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_scribe_outbox_job() TO "anon";
GRANT EXECUTE ON FUNCTION public.sync_scribe_outbox_job() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.tagesplan_status_update(p_termin_id uuid, p_neuer_status text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tagesplan_status_update(p_termin_id uuid, p_neuer_status text) TO "anon";
GRANT EXECUTE ON FUNCTION public.tagesplan_status_update(p_termin_id uuid, p_neuer_status text) TO "service_role";
GRANT EXECUTE ON FUNCTION public.update_tagesplan_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_tagesplan_updated_at() TO "anon";
GRANT EXECUTE ON FUNCTION public.update_tagesplan_updated_at() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.update_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_updated_at() TO "anon";
GRANT EXECUTE ON FUNCTION public.update_updated_at() TO "authenticated";
GRANT EXECUTE ON FUNCTION public.void_kassen_zahlung(p_id uuid, p_reason text) TO "anon";
GRANT EXECUTE ON FUNCTION public.void_kassen_zahlung(p_id uuid, p_reason text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public.void_kassen_zahlung(p_id uuid, p_reason text) TO "service_role";
DO $acl_verify$ DECLARE p pg_proc%ROWTYPE; BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=24189::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3ce756e4f402940c204bfa8c0ba6916f'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: abgleich_patient_aus_submission';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19690::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3903a7778be1c7c59e189eabd656bd37'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_import_ivoris_plaene';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20604::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'c09623a34188ac2661e7d63a5a5e4d1b'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_iban';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20616::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'d49b4ee5e380aeb7d8608ca66cdf28ce'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_kette';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20559::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'885438df71fd2d69fe91299117bb921f'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_namen_im_zweck';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19671::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'2b104639f0ec00590c40f22122921db1'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_names';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19744::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'ba51f06ff96d9e8739ec6cb6d1cd550c'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_names_v2';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19864::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'c0cdcf6b0f5ed6033257a6e6fdd4fa55'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_referenz';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19760::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'5379152cc8dcb96dbf8f7b832b27f810'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_match_typos';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19677::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'816291c74b6d24d8b896e3276aa39fc3'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ac_rekonstruiere_plaene';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25797::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'08f9b989c45e218b4349d9edd6b8d0fe'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: animahost_memory_write';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25146::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'85c8ced6f70038051f9d3bfc6680a30a'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: auto_patient_profile';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39452::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'2dfc2c139e7cb3b6c86769f1e1c2cb48'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: claim_integration_outbox_job';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39485::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'1484788b640402215218b4931f04e494'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: claim_integration_outbox_job_for_artifact';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=27643::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'13034ac1162aef30089684cc405cd4d6'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: doku_baustein_nutzung_erhoehen';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=19995::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'ac851cae1772738eccacb9fa806e8593'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: kassen_beleg_nr';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48339::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'035ed634e75fec328075c63365a8e47f'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: ledger_record_practice_payment';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=17755::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3cbfd727642c2bf790cc4a6925f7b25b'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: mark_overdue_rates';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48916::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'760ff612bd74ef558d1ef55c7ae9e7a3'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: merge_duplicate_patient_with_ivoris_alias';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48917::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'d335e6d21472e0cd36e505c2f3f31f8d'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: merge_local_patient_duplicate';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39341::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'b34758e60ac277660e531e8e02d226d5'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: merge_patient_into_canonical';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25330::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'747fade9486aa64ced3800b12c719644'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: patient_checkin';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=20461::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'d6a9a94eb571bba4772907df552185e4'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: praxis_pass_touch';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39613::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'385099f70f41f042bc294442e4012880'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: record_integration_outbox_event';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39640::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'604a911de9b47e7a7514ed865c928d31'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: resolve_scribe_patient_atomic';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39429::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'0d8e90027e32ea463ccb68119fc3bb8d'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: sync_animasign_outbox_jobs';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=39431::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'3f8c0e10e76f2f040291afe89086d693'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: sync_scribe_outbox_job';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25331::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'9967151cffaa194aff16cb75db5d4157'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: tagesplan_status_update';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=25323::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'2caaf3a205326caca6ebb9b975509f01'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: update_tagesplan_updated_at';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=17751::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'463de825ab5cc45c0e77d827c39ae9ac'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"PUBLIC","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: update_updated_at';
 END IF;

 SELECT * INTO p FROM pg_proc WHERE oid=48341::oid;
 IF NOT FOUND OR pg_get_userbyid(p.proowner)<>'postgres' OR md5(pg_get_functiondef(p.oid))<>'db28234e315a87e4e534a7fd833ecf20'
   OR (SELECT jsonb_agg(jsonb_build_object('grantor',pg_get_userbyid(a.grantor),'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END COLLATE "C",pg_get_userbyid(a.grantor) COLLATE "C",a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'grantee' COLLATE "C",x->>'grantor' COLLATE "C",x->>'privilege') FROM jsonb_array_elements('[{"grantee":"anon","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"authenticated","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"postgres","grantor":"postgres","grantable":false,"privilege":"EXECUTE"},{"grantee":"service_role","grantor":"postgres","grantable":false,"privilege":"EXECUTE"}]'::jsonb) x) THEN
   RAISE EXCEPTION 'ACL inventory drift: void_kassen_zahlung';
 END IF;
END $acl_verify$;
COMMIT;
