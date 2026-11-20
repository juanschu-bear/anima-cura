-- 091_animahost_whatsapp_closures.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.patients') IS NULL OR
    to_regclass('public.animahost_whatsapp_settings') IS NULL OR
    to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 091_animahost_whatsapp_closures.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 ALTER TABLE public.animahost_whatsapp_settings ADD COLUMN IF NOT EXISTS closure_periods jsonb NOT NULL DEFAULT '[]'::jsonb
   CHECK (jsonb_typeof(closure_periods) = 'array' AND jsonb_array_length(closure_periods) <= 100);
END
$install$;
SELECT '091_animahost_whatsapp_closures.sql eingespielt' AS ergebnis;
