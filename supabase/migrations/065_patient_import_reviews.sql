-- Release only after 27.10.2026 18:00 Europe/Berlin. No backfill or existing-row updates.
BEGIN;
CREATE TABLE public.patient_import_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source='ivoris'),
  external_id text NOT NULL CHECK (length(external_id) BETWEEN 1 AND 200),
  first_name text NOT NULL, last_name text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('birthdate_missing','birthdate_invalid')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE(source,external_id),
  CHECK ((state='open' AND resolved_at IS NULL) OR (state='resolved' AND resolved_at IS NOT NULL))
);
CREATE INDEX patient_import_reviews_open ON public.patient_import_reviews(created_at,id) WHERE state='open';
ALTER TABLE public.patient_import_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_import_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.patient_import_reviews TO service_role;
-- Browser access only through authenticated practice-role checked API, no new RPCs.
NOTIFY pgrst,'reload schema';
COMMIT;
