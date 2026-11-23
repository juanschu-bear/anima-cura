-- 106_animahost_chat_identity.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $$ BEGIN
 IF to_regclass('public.patients') IS NULL OR to_regclass('public.animahost_whatsapp_settings') IS NULL OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: Diese Datei gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).'; END IF;
END $$;
BEGIN;
CREATE TABLE public.animahost_chat_identity_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,chat_jid text NOT NULL,phone text NOT NULL,
 patient_id uuid NOT NULL REFERENCES public.patients(id),matched_name text NOT NULL,
 status text NOT NULL DEFAULT 'provisional' CHECK(status IN ('provisional','confirmed','released')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),decided_by uuid REFERENCES public.user_profiles(id),
 UNIQUE(tenant_id,chat_jid,phone,patient_id)
);
CREATE INDEX animahost_chat_identity_patient ON public.animahost_chat_identity_links(patient_id,status);
ALTER TABLE public.animahost_chat_identity_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.animahost_chat_identity_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.animahost_chat_identity_links TO service_role;
CREATE FUNCTION public.animahost_decide_chat_identity(p_tenant uuid,p_link uuid,p_actor uuid,p_confirm boolean) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=p_actor AND role IN('admin','verwaltung')) THEN RAISE EXCEPTION 'identity_actor_forbidden'; END IF;
 UPDATE public.animahost_chat_identity_links SET status=CASE WHEN p_confirm THEN 'confirmed' ELSE 'released' END,
  decided_by=p_actor,updated_at=now() WHERE id=p_link AND tenant_id=p_tenant;
 IF NOT FOUND THEN RAISE EXCEPTION 'identity_link_not_found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.animahost_decide_chat_identity(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.animahost_decide_chat_identity(uuid,uuid,uuid,boolean) TO service_role;
COMMIT;
SELECT '106_animahost_chat_identity.sql eingespielt' AS ergebnis;
