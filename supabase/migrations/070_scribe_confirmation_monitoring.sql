-- Privacy-minimal, append-only monitoring for Scribe confirmation outcomes.
-- No clinical text, patient reference, person name or user id is stored.
BEGIN;

CREATE TABLE IF NOT EXISTS public.scribe_confirmation_attempts (
  occurred_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN ('rejected', 'confirmed')),
  template_key text NOT NULL CHECK (char_length(template_key) BETWEEN 3 AND 401),
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT scribe_confirmation_attempts_issues_array CHECK (jsonb_typeof(issues) = 'array'),
  CONSTRAINT scribe_confirmation_attempts_outcome_issues CHECK (
    (outcome = 'confirmed' AND issues = '[]'::jsonb)
    OR (outcome = 'rejected' AND jsonb_array_length(issues) > 0)
  )
);

ALTER TABLE public.scribe_confirmation_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.scribe_confirmation_attempts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prevent_scribe_confirmation_attempt_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  RAISE EXCEPTION 'scribe confirmation monitoring is append-only';
END;
$function$;

DROP TRIGGER IF EXISTS scribe_confirmation_attempts_append_only ON public.scribe_confirmation_attempts;
CREATE TRIGGER scribe_confirmation_attempts_append_only
BEFORE UPDATE OR DELETE ON public.scribe_confirmation_attempts
FOR EACH ROW EXECUTE FUNCTION public.prevent_scribe_confirmation_attempt_mutation();

REVOKE ALL ON FUNCTION public.prevent_scribe_confirmation_attempt_mutation() FROM PUBLIC;

COMMIT;

