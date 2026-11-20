-- 095_animahost_reject_contact_change.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.animahost_contact_changes') IS NULL OR
    to_regclass('public.practice_notifications') IS NULL OR
    to_regclass('public.patient_access_memberships') IS NULL OR
    to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt oder fehlende Migration 094: 095_animahost_reject_contact_change.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;

 ALTER TABLE public.animahost_contact_changes
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid;
 ALTER TABLE public.animahost_contact_changes DROP CONSTRAINT IF EXISTS animahost_contact_changes_state_check;
 ALTER TABLE public.animahost_contact_changes ADD CONSTRAINT animahost_contact_changes_state_check CHECK (
  (state IN ('pending','applied') AND rejected_at IS NULL AND rejected_by IS NULL) OR
  (state='rejected' AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND applied_at IS NULL AND confirmed_by IS NULL)
 );

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_protect_rejected_contact_change()
  RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 BEGIN
  IF OLD.state='rejected' THEN RAISE EXCEPTION 'contact_change_rejected'; END IF;
  RETURN NEW;
 END
 $body$;$ddl$;
 DROP TRIGGER IF EXISTS animahost_rejected_contact_change_immutable ON public.animahost_contact_changes;
 CREATE TRIGGER animahost_rejected_contact_change_immutable BEFORE UPDATE ON public.animahost_contact_changes
  FOR EACH ROW EXECUTE FUNCTION public.animahost_protect_rejected_contact_change();

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_reject_contact_change(
  p_request uuid,p_user uuid,p_title text,p_body text
 ) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 DECLARE c public.animahost_contact_changes;
 BEGIN
  SELECT * INTO c FROM public.animahost_contact_changes WHERE id=p_request FOR UPDATE;
  IF NOT FOUND OR NOT(c.proposed ? 'email') OR NOT EXISTS(
   SELECT 1 FROM public.user_profiles u WHERE u.id=p_user AND u.role='patient' AND (
    u.patient_id=c.patient_id OR EXISTS(SELECT 1 FROM public.patient_access_memberships m
     WHERE m.user_id=u.id AND m.patient_id=c.patient_id)
   )
  ) THEN RAISE EXCEPTION 'contact_change_not_found'; END IF;

  IF c.state='applied' THEN RAISE EXCEPTION 'contact_change_already_applied'; END IF;
  IF c.state='rejected' THEN RETURN jsonb_build_object('id',c.id,'state','rejected'); END IF;

  UPDATE public.animahost_contact_changes SET state='rejected',rejected_at=now(),rejected_by=p_user WHERE id=c.id;
  INSERT INTO public.practice_notifications(recipient_role,kind,title,body,link,source_key)
   SELECT role,'wichtig',p_title,p_body,'/patienten/'||c.patient_id::text,'animahost-contact-rejected:'||c.id::text
   FROM unnest(ARRAY['admin','verwaltung']) AS role
   ON CONFLICT(source_key,recipient_role) DO NOTHING;
  RETURN jsonb_build_object('id',c.id,'state','rejected');
 END
 $body$;$ddl$;
 REVOKE ALL ON FUNCTION public.animahost_protect_rejected_contact_change(),
   public.animahost_reject_contact_change(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_reject_contact_change(uuid,uuid,text,text) TO service_role;
END
$install$;
SELECT '095_animahost_reject_contact_change.sql eingespielt' AS ergebnis;
