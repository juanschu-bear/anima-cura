-- 108_practice_app_access.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $$ BEGIN IF to_regclass('public.patient_access_memberships') IS NULL OR to_regclass('public.animahost_knowledge_versions') IS NULL OR to_regclass('public.animaline_connections') IS NOT NULL THEN RAISE EXCEPTION 'Falsches Projekt: Anima Cura (zymqxzhjbcxzhzvjqvbv) erforderlich.'; END IF; END $$;
BEGIN;
ALTER TABLE public.invoice_access_links ADD COLUMN patient_ids uuid[];
ALTER TABLE public.invoice_access_links ADD CONSTRAINT access_scope_not_empty CHECK(patient_ids IS NULL OR cardinality(patient_ids)>0);
CREATE TABLE public.practice_app_access_requests (
 id uuid PRIMARY KEY, patient_id uuid NOT NULL REFERENCES public.patients(id), actor_id uuid NOT NULL,
 recipient_key text NOT NULL CHECK(recipient_key IN('patient','policyholder','second_guardian')),
 email text NOT NULL, scope_key text NOT NULL UNIQUE,
 state text NOT NULL CHECK(state IN('processing','accepted','failed','outcome_unknown')),
 error_code text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 recipient_confirmed boolean NOT NULL CHECK(recipient_confirmed)
);
CREATE INDEX practice_app_access_patient ON public.practice_app_access_requests(patient_id,created_at DESC);
ALTER TABLE public.practice_app_access_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_app_access_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.practice_app_access_requests TO service_role;
CREATE POLICY practice_app_access_service ON public.practice_app_access_requests TO service_role USING(true) WITH CHECK(true);
COMMIT;
SELECT '108_practice_app_access.sql' AS datei,'eingespielt' AS status;
