-- 096_animahost_appointment_tolerance.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.patients') IS NULL OR
    to_regclass('public.animahost_whatsapp_settings') IS NULL OR
    to_regclass('public.practice_notifications') IS NULL OR
    to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 096_animahost_appointment_tolerance.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;

 ALTER TABLE public.animahost_whatsapp_settings
  ADD COLUMN appointment_tolerance jsonb NOT NULL DEFAULT
   '{"okUpTo":15,"rebookFrom":30,"between":"case_by_case","lenientTypes":["aligner-schienenkontrolle","geraetekontrolle-herausnehmbare-spange","kontrolle-feste-zahnspange","jahreskontrolle"],"strictTypes":["erstuntersuchung-erwachsener","erstuntersuchung-kind","besprechung"]}'::jsonb
  CHECK (jsonb_typeof(appointment_tolerance) = 'object');
 ALTER TABLE public.animahost_whatsapp_decisions ADD COLUMN appointment_context jsonb;
 CREATE TABLE public.animahost_appointment_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  message_id text NOT NULL,
  chat_jid text NOT NULL,
  appointment_date date NOT NULL,
  original_time time NOT NULL,
  arrival_time time NOT NULL,
  delay_minutes integer NOT NULL CHECK (delay_minutes > 0),
  appointment_type_id text,
  language text NOT NULL CHECK (language IN ('de','en','es')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reminder_at timestamptz NOT NULL,
  reminded_at timestamptz,
  fallback_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','phone_required')),
  decided_at timestamptz,
  decided_by uuid,
  note text CHECK (char_length(note) <= 280),
  delivery_state text NOT NULL DEFAULT 'none' CHECK (delivery_state IN ('none','queued','sending','sent','uncertain','skipped')),
  patient_reply text,
  claimed_at timestamptz,
  finished_at timestamptz,
  provider_message_id text,
  UNIQUE(tenant_id,message_id),
  CHECK (arrival_time > original_time)
 );
 CREATE UNIQUE INDEX animahost_open_arrival_case ON public.animahost_appointment_cases
  (tenant_id,chat_jid,appointment_date,original_time) WHERE status='pending';
 CREATE INDEX animahost_appointment_case_deadlines ON public.animahost_appointment_cases
  (tenant_id,status,fallback_at);
 CREATE INDEX animahost_appointment_case_delivery ON public.animahost_appointment_cases
  (tenant_id,delivery_state,decided_at);
 ALTER TABLE public.animahost_appointment_cases ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_appointment_cases FROM PUBLIC,anon,authenticated;
 GRANT SELECT, INSERT, UPDATE ON public.animahost_appointment_cases TO service_role;
 CREATE POLICY animahost_appointment_cases_service ON public.animahost_appointment_cases
  TO service_role USING (true) WITH CHECK (true);
END
$install$;
SELECT '096_animahost_appointment_tolerance.sql eingespielt' AS ergebnis;
