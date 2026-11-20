-- 092_animahost_whatsapp_access_reissues.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.patients') IS NULL OR
    to_regclass('public.animahost_whatsapp_settings') IS NULL OR
    to_regclass('public.communication_messages') IS NULL OR
    to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 092_animahost_whatsapp_access_reissues.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 CREATE TABLE IF NOT EXISTS public.animahost_whatsapp_access_reissues (
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  message_id text NOT NULL CHECK (length(message_id) BETWEEN 1 AND 200),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('activation','recovery','invoice')),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending','accepted','unconfirmed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,message_id)
 );
 ALTER TABLE public.animahost_whatsapp_access_reissues ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_whatsapp_access_reissues FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT ON public.animahost_whatsapp_access_reissues TO service_role;
 GRANT UPDATE (status) ON public.animahost_whatsapp_access_reissues TO service_role;
END
$install$;
SELECT '092_animahost_whatsapp_access_reissues.sql eingespielt' AS ergebnis;
