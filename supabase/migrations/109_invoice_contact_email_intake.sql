-- 109_invoice_contact_email_intake.sql | Zielprojekt: Anima Cura | Projekt-ID: zymqxzhjbcxzhzvjqvbv
DO $$ BEGIN
 IF to_regclass('public.patients') IS NULL OR to_regclass('abrechnung.active_patient_invoice_documents') IS NULL OR to_regclass('public.animahost_knowledge_versions') IS NULL OR to_regclass('public.animaline_connections') IS NOT NULL THEN
  RAISE EXCEPTION 'Falsches Projekt: Anima Cura (zymqxzhjbcxzhzvjqvbv) erforderlich.';
 END IF;
END $$;
BEGIN;
CREATE TABLE public.invoice_contact_email_intakes(
 id uuid PRIMARY KEY,tenant_id uuid NOT NULL,campaign text NOT NULL,chat_jid text NOT NULL,message_id text NOT NULL,
 received_at timestamptz NOT NULL,normalized_email text NOT NULL,patient_ids uuid[] NOT NULL CHECK(cardinality(patient_ids) BETWEEN 1 AND 20),
 actor_id uuid,source text NOT NULL DEFAULT 'whatsapp_reply' CHECK(source='whatsapp_reply'),
 state text NOT NULL CHECK(state IN('prepared','queued','completed','needs_review','outcome_unknown')),
 error_code text,invoice_count integer NOT NULL DEFAULT 0 CHECK(invoice_count>=0),email_recorded_at timestamptz,
 delivery_queued_at timestamptz,access_email_sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,message_id)
);
ALTER TABLE public.invoice_contact_email_intakes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_contact_email_intakes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.invoice_contact_email_intakes TO service_role;

CREATE FUNCTION public.prepare_invoice_contact_email(p_request uuid,p_tenant uuid,p_campaign text,p_chat text,p_message text,p_received timestamptz,p_email text,p_patients uuid[],p_actor uuid)
RETURNS TABLE(state text,error_code text,email_recorded_at timestamptz,invoice_count integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE existing public.invoice_contact_email_intakes;stamp timestamptz:=now();docs integer;
BEGIN
 SELECT * INTO existing FROM public.invoice_contact_email_intakes WHERE id=p_request FOR UPDATE;
 IF FOUND THEN RETURN QUERY SELECT existing.state,existing.error_code,existing.email_recorded_at,existing.invoice_count;RETURN;END IF;
 IF p_campaign<>'invoice-email-q1-q3-2026' OR p_email<>lower(btrim(p_email)) OR p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR cardinality(p_patients) NOT BETWEEN 1 AND 20 OR cardinality(p_patients)<>(SELECT count(DISTINCT x) FROM unnest(p_patients)x) THEN
  RAISE EXCEPTION 'invoice_contact_email_invalid';
 END IF;
 PERFORM 1 FROM public.patients WHERE id=ANY(p_patients) FOR UPDATE;
 IF (SELECT count(*) FROM public.patients WHERE id=ANY(p_patients))<>cardinality(p_patients) THEN
  INSERT INTO public.invoice_contact_email_intakes(id,tenant_id,campaign,chat_jid,message_id,received_at,normalized_email,patient_ids,actor_id,state,error_code)
  VALUES(p_request,p_tenant,p_campaign,p_chat,p_message,p_received,p_email,p_patients,p_actor,'needs_review','patient_scope_missing');
  RETURN QUERY SELECT 'needs_review'::text,'patient_scope_missing'::text,NULL::timestamptz,0;RETURN;
 END IF;
 IF EXISTS(SELECT FROM public.patients WHERE id=ANY(p_patients) AND nullif(lower(btrim(email)),'') IS NOT NULL AND lower(btrim(email))<>p_email) THEN
  INSERT INTO public.invoice_contact_email_intakes(id,tenant_id,campaign,chat_jid,message_id,received_at,normalized_email,patient_ids,actor_id,state,error_code)
  VALUES(p_request,p_tenant,p_campaign,p_chat,p_message,p_received,p_email,p_patients,p_actor,'needs_review','profile_email_conflict');
  RETURN QUERY SELECT 'needs_review'::text,'profile_email_conflict'::text,NULL::timestamptz,0;RETURN;
 END IF;
 SELECT count(*)::int INTO docs FROM abrechnung.active_patient_invoice_documents d
 WHERE d.patient_id=ANY(p_patients)
  AND d.fields->>'quarter' IN('2026-Q1','2026-Q2','2026-Q3')
  AND NOT coalesce((d.fields->>'informationOnly')::boolean,false)
  AND coalesce((d.fields->>'patientCents')::bigint,0)>0;
 IF docs=0 OR EXISTS(SELECT FROM unnest(p_patients)x WHERE NOT EXISTS(
  SELECT FROM abrechnung.active_patient_invoice_documents d WHERE d.patient_id=x
   AND d.fields->>'quarter' IN('2026-Q1','2026-Q2','2026-Q3')
   AND NOT coalesce((d.fields->>'informationOnly')::boolean,false)
   AND coalesce((d.fields->>'patientCents')::bigint,0)>0)) THEN
  INSERT INTO public.invoice_contact_email_intakes(id,tenant_id,campaign,chat_jid,message_id,received_at,normalized_email,patient_ids,actor_id,state,error_code,invoice_count)
  VALUES(p_request,p_tenant,p_campaign,p_chat,p_message,p_received,p_email,p_patients,p_actor,'needs_review','invoice_documents_missing',docs);
  RETURN QUERY SELECT 'needs_review'::text,'invoice_documents_missing'::text,NULL::timestamptz,docs;RETURN;
 END IF;
 UPDATE public.patients SET email=p_email,updated_at=stamp WHERE id=ANY(p_patients) AND nullif(btrim(email),'') IS NULL;
 INSERT INTO public.invoice_contact_email_intakes(id,tenant_id,campaign,chat_jid,message_id,received_at,normalized_email,patient_ids,actor_id,state,invoice_count,email_recorded_at)
 VALUES(p_request,p_tenant,p_campaign,p_chat,p_message,p_received,p_email,p_patients,p_actor,'prepared',docs,stamp);
 RETURN QUERY SELECT 'prepared'::text,NULL::text,stamp,docs;
END $$;
REVOKE ALL ON FUNCTION public.prepare_invoice_contact_email(uuid,uuid,text,text,text,timestamptz,text,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_invoice_contact_email(uuid,uuid,text,text,text,timestamptz,text,uuid[],uuid) TO service_role;
COMMIT;
SELECT '109_invoice_contact_email_intake.sql' AS dateiname,'eingespielt' AS status;
