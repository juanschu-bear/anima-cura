-- 093_animahost_attendance_certificates.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $install$
BEGIN
 IF to_regclass('public.patients') IS NULL OR
    to_regclass('public.patient_documents') IS NULL OR
    to_regclass('public.doku_tagesdatensaetze') IS NULL OR
    to_regclass('public.animahost_whatsapp_settings') IS NULL OR
    to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: 093_animahost_attendance_certificates.sql gehört zu Anima Cura (zymqxzhjbcxzhzvjqvbv).';
 END IF;
 CREATE TABLE IF NOT EXISTS public.animahost_attendance_certificates (
  document_id uuid PRIMARY KEY REFERENCES public.patient_documents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.animahost_whatsapp_settings(tenant_id),
  source_message_id text NOT NULL CHECK (length(source_message_id) BETWEEN 1 AND 200),
  service_date date NOT NULL,
  service_time time(0) NOT NULL,
  verification_hash text NOT NULL UNIQUE CHECK (verification_hash ~ '^[0-9a-f]{64}$'),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence)='object' AND evidence ?& ARRAY['source','id']),
  artwork_version text NOT NULL CHECK (length(artwork_version) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  UNIQUE(tenant_id,source_message_id)
 );
 ALTER TABLE public.animahost_attendance_certificates ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.animahost_attendance_certificates FROM PUBLIC,anon,authenticated;
 GRANT SELECT,INSERT ON public.animahost_attendance_certificates TO service_role;
 GRANT UPDATE (revoked_at) ON public.animahost_attendance_certificates TO service_role;
 CREATE INDEX IF NOT EXISTS animahost_decisions_by_chat ON public.animahost_whatsapp_decisions(tenant_id,sender_jid,created_at DESC);
 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.animahost_publish_attendance_certificate(
  p_document uuid,p_patient uuid,p_tenant uuid,p_message text,p_date date,p_time time,
  p_hash text,p_evidence jsonb,p_artwork text,p_title text
 ) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $body$
 DECLARE existing uuid;
 BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant::text || ':' || p_message,0));
  SELECT c.document_id INTO existing FROM public.animahost_attendance_certificates c
   WHERE c.tenant_id=p_tenant AND c.source_message_id=p_message AND c.revoked_at IS NULL;
  IF FOUND THEN
   IF NOT EXISTS(SELECT 1 FROM public.patient_documents d WHERE d.id=existing AND d.patient_id=p_patient) THEN
    RAISE EXCEPTION 'attendance_identity_conflict';
   END IF;
   RETURN existing;
  END IF;
  INSERT INTO public.patient_documents(id,patient_id,name,typ,file_url)
   VALUES(p_document,p_patient,p_title,'sonstiges','/api/patient/dokumente/' || p_document::text || '/datei');
  INSERT INTO public.animahost_attendance_certificates(document_id,tenant_id,source_message_id,service_date,service_time,
    verification_hash,evidence,artwork_version)
   VALUES(p_document,p_tenant,p_message,p_date,p_time,p_hash,p_evidence,p_artwork);
  RETURN p_document;
 END
 $body$;$ddl$;
 REVOKE ALL ON FUNCTION public.animahost_publish_attendance_certificate(uuid,uuid,uuid,text,date,time,text,jsonb,text,text)
   FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION public.animahost_publish_attendance_certificate(uuid,uuid,uuid,text,date,time,text,jsonb,text,text) TO service_role;
END
$install$;
SELECT '093_animahost_attendance_certificates.sql eingespielt' AS ergebnis;
