-- 097_animahost_phone_identity.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.patients') IS NULL OR to_regclass('public.animahost_whatsapp_settings') IS NULL
    OR to_regclass('public.zahler') IS NULL OR to_regclass('public.billing_invoice_recipient_versions') IS NULL
    OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 097_animahost_phone_identity.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 ALTER TABLE public.animahost_whatsapp_settings ADD COLUMN team_reply_days jsonb NOT NULL DEFAULT '[1,2,3,4,5]'
  CHECK (jsonb_typeof(team_reply_days)='array' AND jsonb_array_length(team_reply_days) BETWEEN 1 AND 7
   AND team_reply_days <@ '[1,2,3,4,5,6,7]');
 ALTER TABLE public.animahost_whatsapp_decisions ADD COLUMN case_details jsonb;
 CREATE TABLE public.animahost_whatsapp_chat_preferences (
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  chat_jid text NOT NULL, informal boolean NOT NULL DEFAULT false,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,chat_jid)
 );
 CREATE TABLE public.animahost_whatsapp_verified_patients (
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  chat_jid text NOT NULL, phone text NOT NULL, patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,chat_jid,patient_id)
 );
 ALTER TABLE public.animahost_whatsapp_chat_preferences ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.animahost_whatsapp_verified_patients ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_whatsapp_chat_preferences,public.animahost_whatsapp_verified_patients FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT,UPDATE ON public.animahost_whatsapp_chat_preferences,public.animahost_whatsapp_verified_patients TO service_role;
 CREATE POLICY animahost_preferences_service ON public.animahost_whatsapp_chat_preferences TO service_role USING(true) WITH CHECK(true);
 CREATE POLICY animahost_verified_patients_service ON public.animahost_whatsapp_verified_patients TO service_role USING(true) WITH CHECK(true);

 EXECUTE $ddl$CREATE FUNCTION public.animahost_normalize_phone(value text) RETURNS text
 LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $f$
  WITH digits AS (SELECT regexp_replace(value,'[^0-9]','','g') AS n),
  clean AS (SELECT CASE WHEN n LIKE '00%' THEN substr(n,3) WHEN n LIKE '0%' THEN '49'||substr(n,2) ELSE n END AS n FROM digits)
  SELECT CASE WHEN n~'^[1-9][0-9]{7,14}$' THEN n END FROM clean
 $f$;$ddl$;
 CREATE INDEX animahost_patient_phone ON public.patients(public.animahost_normalize_phone(telefon));
 CREATE INDEX animahost_patient_mobile ON public.patients(public.animahost_normalize_phone(mobiltelefon));
 CREATE INDEX animahost_guardian_phone ON public.patients(public.animahost_normalize_phone(versicherter_telefon));
 CREATE INDEX animahost_second_guardian_phone ON public.patients(public.animahost_normalize_phone(eb2_telefon));
 CREATE INDEX animahost_payer_phone ON public.zahler(public.animahost_normalize_phone(telefon));

 EXECUTE $ddl$CREATE FUNCTION public.animahost_phone_patients(p_phone text)
 RETURNS TABLE(id uuid,vorname text,nachname text,geburtsdatum date,geschlecht text)
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $f$
 WITH matches AS (
  SELECT p.id FROM public.patients p WHERE
   public.animahost_normalize_phone(p.telefon)=p_phone OR public.animahost_normalize_phone(p.mobiltelefon)=p_phone OR
   public.animahost_normalize_phone(p.versicherter_telefon)=p_phone OR public.animahost_normalize_phone(p.eb2_telefon)=p_phone
  UNION
  SELECT b.patient_id FROM public.behandlungsfall b JOIN public.zahler z ON z.id=b.zahler_id
   WHERE b.status='aktiv' AND public.animahost_normalize_phone(z.telefon)=p_phone
  UNION
  SELECT r.patient_id FROM public.billing_invoice_recipient_versions r JOIN public.zahler z ON z.id=r.zahler_id
   WHERE r.state='active' AND public.animahost_normalize_phone(coalesce(z.telefon,r.snapshot->>'phone'))=p_phone
 )
 SELECT p.id,p.vorname::text,p.nachname::text,p.geburtsdatum::date,p.geschlecht::text
 FROM public.patients p JOIN matches m ON m.id=p.id
 WHERE p_phone~'^[1-9][0-9]{7,14}$' AND nullif(trim(p.vorname),'') IS NOT NULL AND nullif(trim(p.nachname),'') IS NOT NULL
 ORDER BY p.nachname,p.vorname,p.id LIMIT 101;
 $f$;$ddl$;
 REVOKE ALL ON FUNCTION public.animahost_normalize_phone(text),public.animahost_phone_patients(text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_normalize_phone(text),public.animahost_phone_patients(text) TO service_role;
END
$install$;
SELECT '097_animahost_phone_identity.sql eingespielt' AS ergebnis;
