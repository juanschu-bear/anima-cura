-- Patient-level billing mode. Existing patients keep their current plan workflow.
-- Juan applies this file in the Production SQL editor before the module migration.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'plan';

ALTER TABLE public.patients
  ADD CONSTRAINT patients_billing_mode_check
  CHECK (billing_mode IN ('plan', 'individual'));

COMMENT ON COLUMN public.patients.billing_mode IS
  'individual: Einzelbehandlung without plan, quarterly advances or quarterly reminders; plan: existing treatment workflow';

CREATE TABLE public.patient_billing_mode_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  previous_mode text NOT NULL,
  new_mode text NOT NULL,
  changed_by uuid NOT NULL,
  reason text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_billing_mode_history_patient ON public.patient_billing_mode_history(patient_id, changed_at DESC);
ALTER TABLE public.patient_billing_mode_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_billing_mode_history FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.set_patient_billing_mode(p_patient_id uuid, p_mode text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor uuid := auth.uid(); previous text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = actor AND role IN ('admin','verwaltung'))
  THEN RAISE EXCEPTION 'billing_mode_forbidden' USING ERRCODE = '42501'; END IF;
  IF p_mode NOT IN ('plan','individual') OR length(trim(coalesce(p_reason,''))) < 3
  THEN RAISE EXCEPTION 'billing_mode_invalid'; END IF;
  SELECT billing_mode INTO previous FROM public.patients WHERE id = p_patient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'patient_not_found'; END IF;
  IF previous <> p_mode THEN
    UPDATE public.patients SET billing_mode = p_mode WHERE id = p_patient_id;
    INSERT INTO public.patient_billing_mode_history(patient_id,previous_mode,new_mode,changed_by,reason)
    VALUES (p_patient_id,previous,p_mode,actor,trim(p_reason));
  END IF;
  RETURN jsonb_build_object('patientId',p_patient_id,'billingMode',p_mode,'changed',previous <> p_mode);
END $$;
REVOKE ALL ON FUNCTION public.set_patient_billing_mode(uuid,text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_patient_billing_mode(uuid,text,text) TO authenticated;

COMMIT;
