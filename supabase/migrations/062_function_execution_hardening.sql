-- Approved ACL-only cleanup already applied 2026-10-26; record it reproducibly.
-- Idempotent. Absent legacy routines are not fabricated; no function/trigger bodies or patient data change.
-- Old grants and rollback: docs/reports/function-acl-2026-10-26-*.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $acl$ BEGIN
 IF to_regprocedure('public.abgleich_patient_aus_submission(uuid)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.abgleich_patient_aus_submission(p_submission_id uuid) FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_import_ivoris_plaene()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_import_ivoris_plaene() FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_match_iban()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_match_iban() FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_match_kette()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_match_kette() FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_match_namen_im_zweck()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_match_namen_im_zweck() FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_match_names(date, date)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_match_names(von date, bis date) FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_match_names_v2()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_match_names_v2() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_match_referenz()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_match_referenz() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_match_typos()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_match_typos() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.ac_rekonstruiere_plaene()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ac_rekonstruiere_plaene() FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.animahost_memory_write(uuid, text, text, text[], text, text[], text, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.animahost_memory_write(p_patient_id uuid, p_patient_name text, p_zusammenfassung text, p_offene_themen text[], p_stimmung text, p_praeferenz_updates text[], p_kommunikationsstil text, p_familie_kontext text) FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.auto_patient_profile()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.auto_patient_profile() FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.claim_integration_outbox_job(text, text, integer)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.claim_integration_outbox_job(p_artifact_type text, p_worker_id text, p_lease_minutes integer) FROM "anon" RESTRICT;
 END IF;
 IF to_regprocedure('public.claim_integration_outbox_job_for_artifact(text, uuid, text, integer, boolean)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.claim_integration_outbox_job_for_artifact(p_artifact_type text, p_artifact_id uuid, p_worker_id text, p_lease_minutes integer, p_force boolean) FROM "anon" RESTRICT;
 END IF;
 IF to_regprocedure('public.doku_baustein_nutzung_erhoehen(text, text, text, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.doku_baustein_nutzung_erhoehen(p_behandlungsart text, p_termin_typ text, p_gruppe text, p_option_text text) FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.kassen_beleg_nr()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.kassen_beleg_nr() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.ledger_record_practice_payment()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.ledger_record_practice_payment() FROM "anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.mark_overdue_rates()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.mark_overdue_rates() FROM PUBLIC,"anon","authenticated","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.merge_duplicate_patient_with_ivoris_alias(uuid, uuid, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.merge_duplicate_patient_with_ivoris_alias(p_source_patient_id uuid, p_target_patient_id uuid, p_reason text) FROM "anon" RESTRICT;
 END IF;
 IF to_regprocedure('public.merge_local_patient_duplicate(uuid, uuid, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.merge_local_patient_duplicate(p_source_patient_id uuid, p_target_patient_id uuid, p_reason text) FROM "anon" RESTRICT;
 END IF;
 IF to_regprocedure('public.merge_patient_into_canonical(uuid, uuid, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.merge_patient_into_canonical(p_source_patient_id uuid, p_target_patient_id uuid, p_reason text) FROM "anon","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.patient_checkin(uuid, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.patient_checkin(p_termin_id uuid, p_via text) FROM PUBLIC,"anon" RESTRICT;
 END IF;
 IF to_regprocedure('public.praxis_pass_touch()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.praxis_pass_touch() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.record_integration_outbox_event()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.record_integration_outbox_event() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.resolve_scribe_patient_atomic(uuid, uuid, uuid)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.resolve_scribe_patient_atomic(p_entry_id uuid, p_patient_id uuid, p_resolved_by uuid) FROM "anon" RESTRICT;
 END IF;
 IF to_regprocedure('public.sync_animasign_outbox_jobs()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.sync_animasign_outbox_jobs() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.sync_scribe_outbox_job()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.sync_scribe_outbox_job() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.tagesplan_status_update(uuid, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.tagesplan_status_update(p_termin_id uuid, p_neuer_status text) FROM PUBLIC,"anon","service_role" RESTRICT;
 END IF;
 IF to_regprocedure('public.update_tagesplan_updated_at()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.update_tagesplan_updated_at() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.update_updated_at()') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC,"anon","authenticated" RESTRICT;
 END IF;
 IF to_regprocedure('public.void_kassen_zahlung(uuid, text)') IS NOT NULL THEN
  REVOKE EXECUTE ON FUNCTION public.void_kassen_zahlung(p_id uuid, p_reason text) FROM "anon","authenticated","service_role" RESTRICT;
 END IF;
END $acl$;
COMMIT;
