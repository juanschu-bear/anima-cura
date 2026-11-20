-- 094_animahost_contact_and_invoice_recipient.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.animahost_whatsapp_settings') IS NULL OR to_regclass('public.billing_invoices') IS NULL OR
    to_regclass('public.zahler') IS NULL OR to_regclass('public.practice_notifications') IS NULL OR
    to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 094_animahost_contact_and_invoice_recipient.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 CREATE TABLE IF NOT EXISTS public.animahost_contact_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  message_id text NOT NULL, patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  previous jsonb NOT NULL, proposed jsonb NOT NULL, state text NOT NULL CHECK (state IN ('pending','applied')),
  created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz, confirmed_by uuid,
  UNIQUE (tenant_id,message_id)
 );
 CREATE INDEX IF NOT EXISTS animahost_contact_changes_patient ON public.animahost_contact_changes(patient_id,applied_at DESC);
 CREATE TABLE IF NOT EXISTS public.billing_invoice_recipient_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  message_id text NOT NULL, patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  zahler_id uuid NOT NULL REFERENCES public.zahler(id), snapshot jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('pending','active','superseded')),
  chat_jid text NOT NULL CHECK (chat_jid ~ '^[0-9]{6,20}@(s[.]whatsapp[.]net|lid)$'),
  language text NOT NULL CHECK(language IN ('de','en')),
  confirmation_hash text UNIQUE CHECK (confirmation_hash ~ '^[a-f0-9]{64}$'), expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz,
  ivoris_mirror_state text NOT NULL DEFAULT 'diverges' CHECK (ivoris_mirror_state IN ('diverges')),
  UNIQUE (tenant_id,message_id)
 );
 CREATE UNIQUE INDEX IF NOT EXISTS one_active_invoice_recipient ON public.billing_invoice_recipient_versions(patient_id) WHERE state='active';
 CREATE TABLE IF NOT EXISTS public.animahost_recipient_followups (
  id uuid PRIMARY KEY REFERENCES public.billing_invoice_recipient_versions(id),
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','skipped','uncertain')),
  created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
 );
 ALTER TABLE public.animahost_recipient_followups ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_recipient_followups FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT,UPDATE ON public.animahost_recipient_followups TO service_role;
 CREATE INDEX IF NOT EXISTS animahost_recipient_followups_pending ON public.animahost_recipient_followups(tenant_id,created_at,id) WHERE state='pending';
 ALTER TABLE public.animahost_contact_changes ENABLE ROW LEVEL SECURITY;
 ALTER TABLE public.billing_invoice_recipient_versions ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_contact_changes,public.billing_invoice_recipient_versions FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT,UPDATE ON public.animahost_contact_changes,public.billing_invoice_recipient_versions TO service_role;
 ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS ivoris_contact_import boolean NOT NULL DEFAULT false;

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_protect_contact_during_ivoris_sync() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
 DECLARE applied_fields text[];
 BEGIN
  IF TG_OP='INSERT' THEN
   IF NEW.ivoris_contact_import THEN UPDATE public.patients SET ivoris_contact_import=false WHERE id=NEW.id; END IF;
   RETURN NEW;
  END IF;
  IF NOT NEW.ivoris_contact_import THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT k) INTO applied_fields FROM public.animahost_contact_changes c,
   LATERAL jsonb_object_keys(c.proposed) k WHERE c.patient_id=OLD.id AND c.state='applied';
  IF 'email'=ANY(applied_fields) THEN NEW.email:=OLD.email; END IF;
  IF 'telefon'=ANY(applied_fields) THEN NEW.telefon:=OLD.telefon; END IF;
  IF 'mobiltelefon'=ANY(applied_fields) THEN NEW.mobiltelefon:=OLD.mobiltelefon; END IF;
  IF 'strasse'=ANY(applied_fields) THEN NEW.strasse:=OLD.strasse; END IF;
  IF 'plz'=ANY(applied_fields) THEN NEW.plz:=OLD.plz; END IF;
  IF 'ort'=ANY(applied_fields) THEN NEW.ort:=OLD.ort; END IF;
  NEW.ivoris_contact_import:=false;
  RETURN NEW;
 END
 $body$;$ddl$;
 DROP TRIGGER IF EXISTS animahost_contact_sync_insert ON public.patients;
 CREATE TRIGGER animahost_contact_sync_insert AFTER INSERT ON public.patients FOR EACH ROW
  WHEN (NEW.ivoris_contact_import) EXECUTE FUNCTION public.animahost_protect_contact_during_ivoris_sync();
 DROP TRIGGER IF EXISTS animahost_contact_sync_update ON public.patients;
 CREATE TRIGGER animahost_contact_sync_update BEFORE UPDATE OF ivoris_contact_import ON public.patients FOR EACH ROW
  EXECUTE FUNCTION public.animahost_protect_contact_during_ivoris_sync();

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_contact_change(
   p_tenant uuid,p_message text,p_patient uuid,p_patch jsonb,p_request uuid,p_user uuid
 ) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 DECLARE c public.animahost_contact_changes; patient public.patients; old_values jsonb; fields text[];
 BEGIN
  IF p_request IS NULL THEN
   IF p_tenant IS NULL OR p_message IS NULL OR p_patient IS NULL OR p_user IS NOT NULL OR
      jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}'::jsonb OR
      (p_patch - ARRAY['email','telefon','mobiltelefon','strasse','plz','ort'])<>'{}'::jsonb OR
      EXISTS(SELECT 1 FROM jsonb_each(p_patch) j WHERE jsonb_typeof(j.value)<>'string' OR length(trim(j.value #>> '{}')) NOT BETWEEN 1 AND 254) THEN
    RAISE EXCEPTION 'contact_change_invalid';
   END IF;
   IF p_patch ?| ARRAY['strasse','plz','ort'] AND NOT (p_patch ?& ARRAY['strasse','plz','ort']) THEN RAISE EXCEPTION 'contact_change_invalid'; END IF;
   SELECT * INTO patient FROM public.patients WHERE id=p_patient FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'contact_change_patient_missing'; END IF;
   SELECT * INTO c FROM public.animahost_contact_changes WHERE tenant_id=p_tenant AND message_id=p_message;
   IF FOUND THEN
    IF c.patient_id<>p_patient OR c.proposed<>p_patch THEN RAISE EXCEPTION 'contact_change_conflict'; END IF;
    RETURN jsonb_build_object('id',c.id,'state',c.state);
   END IF;
   SELECT coalesce(jsonb_object_agg(k,to_jsonb(patient)->k),'{}'::jsonb) INTO old_values FROM jsonb_object_keys(p_patch) k;
   INSERT INTO public.animahost_contact_changes(tenant_id,message_id,patient_id,previous,proposed,state)
    VALUES(p_tenant,p_message,p_patient,old_values,p_patch,'pending') RETURNING * INTO c;
   IF p_patch ? 'email' THEN RETURN jsonb_build_object('id',c.id,'state','pending'); END IF;
  ELSE
   SELECT * INTO c FROM public.animahost_contact_changes WHERE id=p_request;
   IF NOT FOUND THEN RAISE EXCEPTION 'contact_change_not_found'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.user_profiles u WHERE u.id=p_user AND u.role='patient' AND (u.patient_id=c.patient_id OR EXISTS(
       SELECT 1 FROM public.patient_access_memberships m WHERE m.user_id=p_user AND m.patient_id=c.patient_id))) THEN
    RAISE EXCEPTION 'contact_change_not_found';
   END IF;
   SELECT * INTO patient FROM public.patients WHERE id=c.patient_id FOR UPDATE;
   SELECT * INTO c FROM public.animahost_contact_changes WHERE id=p_request FOR UPDATE;
   IF c.state='applied' THEN RETURN jsonb_build_object('id',c.id,'state',c.state); END IF;
   IF c.created_at<now()-interval '24 hours' OR NOT(c.proposed ? 'email') THEN RAISE EXCEPTION 'contact_change_expired'; END IF;
  END IF;
  SELECT array_agg(k) INTO fields FROM jsonb_object_keys(c.proposed) k;
  IF EXISTS(SELECT 1 FROM unnest(fields) k WHERE (to_jsonb(patient)->k) IS DISTINCT FROM (c.previous->k)) THEN
   RAISE EXCEPTION 'contact_change_stale';
  END IF;
  IF c.proposed ? 'email' THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('contact-email:'||lower(c.proposed->>'email'),0));
  END IF;
  IF c.proposed ? 'email' AND EXISTS(SELECT 1 FROM public.patients p
    WHERE p.id<>c.patient_id AND lower(btrim(p.email))=lower(c.proposed->>'email') AND NOT EXISTS (
      SELECT 1 FROM public.patient_access_memberships m WHERE m.user_id=p_user AND m.patient_id=p.id)) THEN
   RAISE EXCEPTION 'contact_email_conflict';
  END IF;
  UPDATE public.patients SET email=coalesce(c.proposed->>'email',email),telefon=coalesce(c.proposed->>'telefon',telefon),
   mobiltelefon=coalesce(c.proposed->>'mobiltelefon',mobiltelefon),strasse=coalesce(c.proposed->>'strasse',strasse),
   plz=coalesce(c.proposed->>'plz',plz),ort=coalesce(c.proposed->>'ort',ort) WHERE id=c.patient_id;
  UPDATE public.animahost_contact_changes SET state='applied',applied_at=now(),confirmed_by=p_user WHERE id=c.id;
  RETURN jsonb_build_object('id',c.id,'state','applied');
 END
 $body$;$ddl$;

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_notify_invoice_recipient(p_version uuid)
 RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 BEGIN
  INSERT INTO public.practice_notifications(recipient_role,kind,title,body,link,source_key)
   SELECT role,'antwort','Rechnungsempfänger für '||concat_ws(' ',p.vorname,p.nachname)||' geändert, bitte in IVORIS nachziehen',
     concat_ws(E'\n','Weicht von IVORIS ab',v.snapshot->>'name',v.snapshot->>'street',
       concat_ws(' ',v.snapshot->>'postalCode',v.snapshot->>'city'),v.snapshot->>'email'),
     '/praxis','animahost-invoice-recipient:'||v.id::text
   FROM public.billing_invoice_recipient_versions v JOIN public.patients p ON p.id=v.patient_id
   CROSS JOIN unnest(ARRAY['admin','verwaltung']) AS role WHERE v.id=p_version AND v.state='active'
   ON CONFLICT(source_key,recipient_role) DO NOTHING;
 END
 $body$;$ddl$;

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_invoice_recipient_change(
  p_tenant uuid,p_message text,p_patient uuid,p_patch jsonb,p_new boolean,p_hash text,p_chat text,p_language text
 ) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 DECLARE current_version public.billing_invoice_recipient_versions; requested public.billing_invoice_recipient_versions;
         payer public.zahler; merged jsonb; created_payer uuid; created_version uuid; existing_payers uuid[];
 BEGIN
  IF p_tenant IS NULL OR p_message IS NULL OR p_patient IS NULL OR p_new IS NULL OR
    jsonb_typeof(p_patch) IS DISTINCT FROM 'object' OR p_patch='{}'::jsonb OR
    p_patch-ARRAY['name','street','postalCode','city','email']<>'{}'::jsonb OR
    EXISTS(SELECT 1 FROM jsonb_each(p_patch) j WHERE jsonb_typeof(j.value)<>'string' OR length(trim(j.value #>> '{}')) NOT BETWEEN 1 AND 254) OR
    (p_new AND (NOT(p_patch ?& ARRAY['name','street','postalCode','city','email']) OR p_hash IS NULL)) OR
    (NOT p_new AND (p_patch ? 'name' OR p_hash IS NOT NULL)) THEN RAISE EXCEPTION 'invoice_recipient_invalid'; END IF;
  IF p_patch ?| ARRAY['street','postalCode','city'] AND NOT(p_patch ?& ARRAY['street','postalCode','city']) THEN RAISE EXCEPTION 'invoice_recipient_invalid'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-recipient:'||p_patient::text,0));
  SELECT * INTO requested FROM public.billing_invoice_recipient_versions WHERE tenant_id=p_tenant AND message_id=p_message;
  IF FOUND THEN
   IF requested.patient_id<>p_patient THEN RAISE EXCEPTION 'invoice_recipient_conflict'; END IF;
   RETURN jsonb_build_object('id',requested.id,'state',requested.state,'created',false);
  END IF;
  SELECT * INTO current_version FROM public.billing_invoice_recipient_versions WHERE patient_id=p_patient AND state='active';
  IF p_new THEN merged:=p_patch;
  ELSE
   IF current_version.id IS NOT NULL THEN merged:=current_version.snapshot||p_patch;
   ELSE
    SELECT array_agg(DISTINCT z.id) INTO existing_payers FROM public.behandlungsfall b JOIN public.zahler z ON z.id=b.zahler_id
     WHERE b.patient_id=p_patient AND b.status='aktiv';
    IF coalesce(cardinality(existing_payers),0)<>1 THEN RAISE EXCEPTION 'invoice_recipient_current_unknown'; END IF;
    SELECT * INTO payer FROM public.zahler WHERE id=existing_payers[1];
    merged:=jsonb_strip_nulls(jsonb_build_object('name',payer.name,'street',payer.strasse,'postalCode',payer.plz,'city',payer.ort,'email',payer.email))||p_patch;
   END IF;
  END IF;
  IF NOT(merged ?& ARRAY['name','street','postalCode','city','email']) THEN RAISE EXCEPTION 'invoice_recipient_missing_details'; END IF;
  INSERT INTO public.zahler(name,strasse,plz,ort,email) VALUES(merged->>'name',merged->>'street',merged->>'postalCode',merged->>'city',merged->>'email') RETURNING id INTO created_payer;
  -- Any older unconfirmed request belongs to a previous decision and cannot later override this one.
  UPDATE public.billing_invoice_recipient_versions SET state='superseded'
   WHERE patient_id=p_patient AND (state='pending' OR (state='active' AND NOT p_new));
  INSERT INTO public.billing_invoice_recipient_versions(tenant_id,message_id,patient_id,zahler_id,snapshot,state,confirmation_hash,expires_at,activated_at,chat_jid,language)
   VALUES(p_tenant,p_message,p_patient,created_payer,merged,CASE WHEN p_new THEN 'pending' ELSE 'active' END,p_hash,
     CASE WHEN p_new THEN now()+interval '24 hours' END,CASE WHEN NOT p_new THEN now() END,p_chat,p_language) RETURNING id INTO created_version;
  IF NOT p_new THEN PERFORM public.animahost_notify_invoice_recipient(created_version); END IF;
  RETURN jsonb_build_object('id',created_version,'state',CASE WHEN p_new THEN 'pending' ELSE 'active' END,'created',true);
 END
 $body$;$ddl$;

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_confirm_invoice_recipient(p_hash text)
 RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 DECLARE v public.billing_invoice_recipient_versions;
 BEGIN
  SELECT * INTO v FROM public.billing_invoice_recipient_versions WHERE confirmation_hash=p_hash;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-recipient:'||v.patient_id::text,0));
  SELECT * INTO v FROM public.billing_invoice_recipient_versions WHERE id=v.id FOR UPDATE;
  IF v.state='active' THEN RETURN true; END IF;
  IF v.state<>'pending' OR v.expires_at<now() THEN RETURN false; END IF;
  UPDATE public.billing_invoice_recipient_versions SET state='superseded' WHERE patient_id=v.patient_id AND state='active';
  UPDATE public.billing_invoice_recipient_versions SET state='active',activated_at=now() WHERE id=v.id;
  PERFORM public.animahost_notify_invoice_recipient(v.id);
  INSERT INTO public.animahost_recipient_followups(id,tenant_id) VALUES(v.id,v.tenant_id) ON CONFLICT DO NOTHING;
  RETURN true;
 END
 $body$;$ddl$;

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_claim_recipient_followup(p_tenant uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 DECLARE v public.billing_invoice_recipient_versions;
 BEGIN
  UPDATE public.animahost_recipient_followups f SET state='skipped',finished_at=now()
   WHERE f.tenant_id=p_tenant AND f.state='pending' AND EXISTS (
    SELECT 1 FROM public.billing_invoice_recipient_versions r WHERE r.id=f.id AND r.state<>'active');
  SELECT r.* INTO v FROM public.animahost_recipient_followups f JOIN public.billing_invoice_recipient_versions r ON r.id=f.id
   WHERE f.tenant_id=p_tenant AND f.state='pending' AND r.state='active'
   ORDER BY f.created_at,f.id LIMIT 1 FOR UPDATE OF f SKIP LOCKED;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.animahost_recipient_followups SET state='sending' WHERE id=v.id;
  RETURN jsonb_build_object('id',v.id,'chatJid',v.chat_jid,'patientId',v.patient_id,'language',v.language);
 END
 $body$;$ddl$;

 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.billing_snapshot_invoice_recipient() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
 DECLARE recipient jsonb;
 BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('invoice-recipient:'||NEW.patient_id::text,0));
  SELECT v.snapshot INTO recipient FROM public.billing_invoice_recipient_versions v WHERE v.patient_id=NEW.patient_id AND v.state='active';
  IF recipient IS NOT NULL THEN NEW.snapshot:=NEW.snapshot||jsonb_build_object('invoiceRecipient',recipient); END IF;
  RETURN NEW;
 END
 $body$;$ddl$;
 DROP TRIGGER IF EXISTS billing_snapshot_invoice_recipient ON public.billing_invoices;
 CREATE TRIGGER billing_snapshot_invoice_recipient BEFORE INSERT ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION public.billing_snapshot_invoice_recipient();

 REVOKE ALL ON FUNCTION public.animahost_contact_change(uuid,text,uuid,jsonb,uuid,uuid),
   public.animahost_notify_invoice_recipient(uuid),public.animahost_invoice_recipient_change(uuid,text,uuid,jsonb,boolean,text,text,text),
   public.animahost_confirm_invoice_recipient(text),public.animahost_claim_recipient_followup(uuid),public.billing_snapshot_invoice_recipient(),
   public.animahost_protect_contact_during_ivoris_sync() FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_contact_change(uuid,text,uuid,jsonb,uuid,uuid),
   public.animahost_notify_invoice_recipient(uuid),public.animahost_invoice_recipient_change(uuid,text,uuid,jsonb,boolean,text,text,text),
   public.animahost_confirm_invoice_recipient(text),public.animahost_claim_recipient_followup(uuid) TO service_role;
END
$install$;
SELECT '094_animahost_contact_and_invoice_recipient.sql eingespielt' AS ergebnis;
