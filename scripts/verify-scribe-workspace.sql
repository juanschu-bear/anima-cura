-- Read-only verification for 078. No patient text, account names or message contents.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT
 (SELECT jsonb_array_length(value) FROM public.einstellungen WHERE key='scribe_praxis_inbox') AS legacy_entries,
 (SELECT count(*) FROM public.scribe_inbox_entries WHERE legacy_payload IS NOT NULL) AS imported_entries,
 (SELECT count(*) FROM public.scribe_inbox_entries n JOIN public.einstellungen s ON s.key='scribe_praxis_inbox'
   CROSS JOIN LATERAL jsonb_array_elements(s.value) old WHERE old->>'id'=n.id::text AND old=n.legacy_payload) AS exact_legacy_backups,
 (SELECT count(*) FROM public.scribe_option_slots) AS permanent_slots,
 (SELECT count(*) FROM public.scribe_option_slots s JOIN public.doku_vorlagen v ON v.id=s.template_id
   WHERE v.behandlungsart='multiband' AND s.source='praxis' AND (s.state->>'hidden')::boolean) AS hidden_multiband_practice_texts,
 (SELECT count(*) FROM public.scribe_inbox_mail_jobs WHERE status='pending') AS pending_mails,
 (SELECT count(*) FROM public.scribe_inbox_mail_jobs WHERE status='failed') AS failed_mails;
SELECT c.relname,c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
 has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') AS authenticated_update
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
 AND c.relname IN ('scribe_option_slots','scribe_option_changes','scribe_template_commands','scribe_inbox_entries','scribe_inbox_events','scribe_inbox_comments','scribe_inbox_mail_jobs','practice_notifications','practice_notification_reads') ORDER BY c.relname;
SELECT p.oid::regprocedure::text AS routine,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('scribe_template_change','scribe_inbox_commit','scribe_claim_inbox_mail','practice_mark_notifications','practice_notification_visible') ORDER BY p.proname;
COMMIT;
