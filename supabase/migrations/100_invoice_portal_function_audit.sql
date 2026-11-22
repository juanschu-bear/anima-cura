-- 100_invoice_portal_function_audit.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
-- Laufname: invoice-portal-audit-after-099-2026-11-22. Ergänzung zu unveränderter, eingespielter 099.
-- Prüft exakte Definitionen aus 098/099. Repariert zusätzlich die von 099 nicht ersetzte Legacy-Liste.
DO $install$
DECLARE item record; definition text; audit_definition text; original text; fingerprint text;
 fn oid; old_acl aclitem[]; old_owner oid; old_config text[]; tuple_text text;
BEGIN
 IF to_regclass('abrechnung.source_invoice_portal_memberships') IS NULL
 OR to_regclass('public.invoice_access_contacts') IS NULL
 OR to_regclass('abrechnung.active_patient_invoice_documents') IS NULL
 OR to_regprocedure('public.animahost_invoice_portal_visibility(uuid,date,date)') IS NULL
 OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt oder 099 fehlt: 100 gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 IF current_user<>'postgres' OR has_schema_privilege('abrechnung_runtime','public','CREATE')
 OR NOT EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.roleid='abrechnung_runtime'::regrole AND m.member=current_user::regrole
 AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option AND m.grantor<>m.member)
 OR EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.roleid='abrechnung_runtime'::regrole AND m.member=current_user::regrole
 AND (m.inherit_option OR m.set_option OR m.grantor=m.member)) THEN
  RAISE EXCEPTION 'Installationsrechte entsprechen nicht dem geprüften Stand.';
 END IF;
 SELECT pg_get_functiondef('public.function_acl_audit(text)'::regprocedure) INTO audit_definition;
 fn:='public.patient_invoice_documents()'::regprocedure;
 SELECT pg_get_functiondef(oid),proacl,proowner,proconfig INTO definition,old_acl,old_owner,old_config FROM pg_proc WHERE oid=fn;
 original:=replace(definition,'public.invoice_portal_jwt_uid()','auth.uid()');
 IF md5(original)<>'a2caf48d36f7564b079bcdb11571454d' OR pg_get_userbyid(old_owner)<>'abrechnung_runtime' THEN
  RAISE EXCEPTION 'Ungeprüfte Funktionsdefinition: patient_invoice_documents';
 END IF;
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH SET TRUE';
 EXECUTE 'GRANT abrechnung_runtime TO CURRENT_USER WITH INHERIT FALSE';
 EXECUTE 'GRANT CREATE ON SCHEMA public TO abrechnung_runtime';
 EXECUTE 'SET LOCAL ROLE abrechnung_runtime';
 EXECUTE replace(original,'auth.uid()','public.invoice_portal_jwt_uid()');
 EXECUTE 'RESET ROLE';
 IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND (proacl IS DISTINCT FROM old_acl OR proowner<>old_owner
 OR proconfig IS DISTINCT FROM old_config OR NOT prosecdef)) THEN RAISE EXCEPTION 'Legacy-Rechte unerwartet verändert'; END IF;
 SELECT md5(pg_get_functiondef(fn)) INTO fingerprint;
 IF position(quote_literal('a2caf48d36f7564b079bcdb11571454d') IN audit_definition)>0 THEN
  audit_definition:=replace(audit_definition,quote_literal('a2caf48d36f7564b079bcdb11571454d'),quote_literal(fingerprint));
 ELSIF position(format('(''patient_invoice_documents'',''%s'',''abrechnung_runtime'')',fingerprint) IN audit_definition)=0 THEN
  RAISE EXCEPTION 'Legacy-Fingerabdruck fehlt im Funktionsaudit';
 END IF;
 FOR item IN SELECT * FROM (VALUES
('patient_invoice_document_edition','uuid,boolean','35ce67e8e26efee5230531dc660f7f8f','f8d1f698658fe32bbc606b8abd5358b7'),
('patient_invoice_document_editions','','a25cc42a1a5d1a90d5ab152943b065b5','b620d6edd399b153769fabc6542a8973'),
('patient_invoice_document_pdf','uuid','61e9be8e11f18e0446f430be53a9bea2','bacad7ff27ffc341417516aa76fb10a0'),
('patient_invoice_document_pdf_for_access','uuid','f73f7f7771eb1b4845ee9a5a74e2d6d7','45625fe16ac57a029358602e09d6bd62'),
('patient_invoice_documents_for_access','','80153eab01a49870bb2252650b82e4d5','6dbf0d6acc70b43f93828c96baa76b10'),
('invoice_portal_jwt_uid','','','03f8510376096446e0c70bb02744625a'),
('invoice_portal_patient_scope','uuid','','f309e64ced0170a6d87ff87c483bc183'),
('invoice_portal_selected_pdf','bytea,bytea,boolean','','9e006e4c165f95ac950971404c899e30'),
('invoice_portal_delivery_preflight','jsonb','','77212fcd5b8a7012691a9779bfcf59f3'),
('animahost_invoice_portal_visibility','uuid,date,date','','6184472531f33adca1bd3528243a1f79'),
('animahost_imported_invoice_documents','uuid,uuid','','23e695094f890cc2475f01e2c35c26b5')
 ) AS checked(name,args,previous_md5,definition_md5) LOOP
  fn:=to_regprocedure(format('public.%I(%s)',item.name,item.args));
  IF fn IS NULL OR md5(pg_get_functiondef(fn))<>item.definition_md5
  OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=fn)<>'abrechnung_runtime'
  OR has_function_privilege('anon',fn,'EXECUTE') THEN
   RAISE EXCEPTION 'Ungeprüfte Funktionsdefinition oder Rechte: %',item.name;
  END IF;
  tuple_text:=format('(''%s'',''%s'',''abrechnung_runtime'')',item.name,item.definition_md5);
  IF position(tuple_text IN audit_definition)>0 THEN CONTINUE; END IF;
  IF item.previous_md5<>'' AND position(quote_literal(item.previous_md5) IN audit_definition)>0 THEN
   audit_definition:=replace(audit_definition,quote_literal(item.previous_md5),quote_literal(item.definition_md5));
  ELSIF item.previous_md5='' AND position('-- Klärfall zu Abrechnungspositionen:' IN audit_definition)>0
    AND position(format('(''%s'',',item.name) IN audit_definition)=0 THEN
   audit_definition:=replace(audit_definition,'-- Klärfall zu Abrechnungspositionen:',tuple_text||E',\n-- Klärfall zu Abrechnungspositionen:');
  ELSE RAISE EXCEPTION 'Funktionsaudit hat einen unbekannten Stand: %',item.name;
  END IF;
 END LOOP;
 EXECUTE audit_definition;
 EXECUTE 'REVOKE CREATE ON SCHEMA public FROM abrechnung_runtime';
 EXECUTE 'REVOKE abrechnung_runtime FROM CURRENT_USER GRANTED BY CURRENT_USER';
 IF has_schema_privilege('abrechnung_runtime','public','CREATE') OR EXISTS(
 SELECT 1 FROM pg_auth_members m WHERE m.roleid='abrechnung_runtime'::regrole AND m.member=current_user::regrole
 AND (m.inherit_option OR m.set_option OR m.grantor=m.member)) THEN RAISE EXCEPTION 'Temporäre Installationsrechte verblieben'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.function_acl_audit()->'violations') v
 WHERE v->>'signature' LIKE 'public.patient_invoice_%' OR v->>'signature' LIKE 'public.invoice_portal_%'
 OR v->>'signature' LIKE 'public.animahost%invoice%') THEN RAISE EXCEPTION 'Rechnungsfunktionen bestehen den Audit nicht'; END IF;
 PERFORM pg_notify('pgrst','reload schema');
END $install$;
SELECT '100_invoice_portal_function_audit.sql' AS dateiname,'eingespielt' AS status;
