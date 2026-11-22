-- Historical production function bodies: 022, 027, 081. Synthetic test schema only.
CREATE FUNCTION public.patient_invoice_documents() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE patient uuid; result jsonb;
BEGIN
 SELECT p.patient_id INTO patient FROM abrechnung.source_user_profiles p WHERE p.id=auth.uid() AND p.role='patient';
 IF patient IS NULL THEN RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'invoiceNumber',d.fields->>'invoiceNumber','date',d.fields->>'date',
   'reference',d.fields->'ivoris'->>'reference','quarter',d.fields->>'quarter','art',d.fields->'ivoris'->>'art',
   'patientCents',d.fields->'patientCents','grossCents',d.fields->'grossCents',
   'positions',d.fields->'ivoris'->'lines','reasons',d.fields->'ivoris'->'reasons',
   'linkedOpenItemId',(SELECT o.id FROM abrechnung.source_offene_posten o WHERE o.patient_id=patient AND nullif(ltrim(upper(trim(o.rechnung_nr)),'0'),'')=d.invoice_key ORDER BY o.id LIMIT 1)
 ) ORDER BY d.fields->>'date' DESC,d.id),'[]'::jsonb) INTO result
 FROM abrechnung.active_patient_invoice_documents d WHERE d.patient_id=patient;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.patient_invoice_document_pdf(document_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT encode(d.content, 'base64') INTO result
  FROM abrechnung.active_patient_invoice_documents d
  WHERE d.id = document_id AND d.patient_id IN (
    SELECT m.patient_id FROM public.patient_access_memberships m WHERE m.user_id = auth.uid()
    UNION SELECT p.patient_id FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'patient' AND p.patient_id IS NOT NULL
  );
  RETURN result;
END $$;
CREATE FUNCTION public.patient_invoice_document_edition(document_id uuid,original_only boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE patient uuid; result jsonb;
BEGIN
 SELECT p.patient_id INTO patient FROM abrechnung.source_user_profiles p WHERE p.id=auth.uid() AND p.role='patient';
 IF patient IS NULL THEN RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object('edition',CASE WHEN v.content IS NOT NULL AND NOT original_only AND coalesce(s.enabled,false) THEN 'typeset' ELSE 'original' END,
  'pdf',encode(CASE WHEN v.content IS NOT NULL AND NOT original_only AND coalesce(s.enabled,false) THEN v.content ELSE d.content END,'base64')) INTO result
 FROM abrechnung.active_patient_invoice_documents d
 LEFT JOIN abrechnung.verified_invoice_editions v ON v.part_id=d.id
 LEFT JOIN LATERAL(SELECT enabled FROM abrechnung.invoice_edition_settings ORDER BY revision DESC LIMIT 1) s ON true
 WHERE d.patient_id=patient AND d.id=document_id;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.patient_invoice_document_editions()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'patientId', d.patient_id,
    'typesetAvailable', v.part_id IS NOT NULL,
    'delivered', CASE WHEN v.part_id IS NOT NULL AND coalesce(s.enabled,false) THEN 'typeset' ELSE 'original' END
  ) ORDER BY d.fields->>'date' DESC, d.id), '[]'::jsonb) INTO result
  FROM abrechnung.active_patient_invoice_documents d
  LEFT JOIN abrechnung.verified_invoice_editions v ON v.part_id = d.id
  LEFT JOIN LATERAL (SELECT enabled FROM abrechnung.invoice_edition_settings ORDER BY revision DESC LIMIT 1) s ON true
  WHERE d.patient_id IN (
    SELECT m.patient_id FROM public.patient_access_memberships m WHERE m.user_id = auth.uid()
    UNION SELECT p.patient_id FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'patient' AND p.patient_id IS NOT NULL
  );
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.patient_invoice_documents_for_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'invoiceNumber', d.fields->>'invoiceNumber', 'date', d.fields->>'date',
    'reference', d.fields->'ivoris'->>'reference', 'quarter', d.fields->>'quarter',
    'art', d.fields->'ivoris'->>'art', 'patientCents', d.fields->'patientCents',
    'grossCents', d.fields->'grossCents', 'positions', d.fields->'ivoris'->'lines',
    'reasons', d.fields->'ivoris'->'reasons', 'patientId', d.patient_id
  ) ORDER BY d.fields->>'date' DESC, d.id), '[]'::jsonb)
  INTO result
  FROM abrechnung.active_patient_invoice_documents d
  WHERE d.patient_id IN (
    SELECT m.patient_id FROM public.patient_access_memberships m WHERE m.user_id = auth.uid()
    UNION SELECT p.patient_id FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'patient' AND p.patient_id IS NOT NULL
  );
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.patient_invoice_document_pdf_for_access(document_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE result text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'patient') THEN
    RAISE EXCEPTION 'patient_invoice_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT encode(d.content, 'base64') INTO result
  FROM abrechnung.active_patient_invoice_documents d
  WHERE d.id = document_id AND d.patient_id IN (
    SELECT m.patient_id FROM public.patient_access_memberships m WHERE m.user_id = auth.uid()
    UNION SELECT p.patient_id FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'patient' AND p.patient_id IS NOT NULL
  );
  RETURN result;
END $$;
