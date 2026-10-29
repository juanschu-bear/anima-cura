-- Scope: only this review table. Do not change role membership or default privileges.
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE public.patient_import_reviews FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.patient_import_reviews TO service_role;
COMMIT;
