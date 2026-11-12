-- Invoice access by private contact address. No patient or financial data is changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_access_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  normalized_email text NOT NULL UNIQUE,
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locale text NOT NULL DEFAULT 'de' CHECK (locale IN ('de','en','es')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoice_access_contact_patients (
  contact_id uuid NOT NULL REFERENCES public.invoice_access_contacts(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, patient_id)
);

CREATE TABLE IF NOT EXISTS public.invoice_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.invoice_access_contacts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  next_path text NOT NULL DEFAULT '/patient/portal?section=rechnungen',
  locale text NOT NULL DEFAULT 'de' CHECK (locale IN ('de','en','es')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS invoice_access_links_lookup ON public.invoice_access_links(token_hash, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoice_access_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.invoice_access_links(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoice_access_attempts_link_time ON public.invoice_access_attempts(link_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.invoice_access_contacts(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.invoice_access_links(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  event text NOT NULL CHECK (event IN ('mail_sent','page_opened','link_consumed','access_created','app_notification_sent','push_sent','app_read','button_clicked')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS invoice_access_events_contact_time ON public.invoice_access_events(contact_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.patient_access_memberships (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.invoice_access_contacts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, patient_id)
);
CREATE INDEX IF NOT EXISTS patient_access_memberships_patient ON public.patient_access_memberships(patient_id);

ALTER TABLE public.invoice_access_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_access_contact_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_access_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.invoice_access_contacts, public.invoice_access_contact_patients, public.invoice_access_links, public.invoice_access_events, public.patient_access_memberships FROM anon, authenticated;

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
REVOKE ALL ON FUNCTION public.patient_invoice_documents_for_access() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.patient_invoice_documents_for_access() TO authenticated;

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
REVOKE ALL ON FUNCTION public.patient_invoice_document_pdf_for_access(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.patient_invoice_document_pdf_for_access(uuid) TO authenticated;

-- Keep the established client contract while extending its authorization to the
-- contact's verified patient memberships.
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
REVOKE ALL ON FUNCTION public.patient_invoice_document_pdf(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.patient_invoice_document_pdf(uuid) TO authenticated;

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
REVOKE ALL ON FUNCTION public.patient_invoice_document_editions() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.patient_invoice_document_editions() TO authenticated;

COMMIT;
