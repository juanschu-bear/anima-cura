-- Immutable evidence for the form-signature completion path.
-- The feature remains disabled until the practice enables the server flag.

CREATE TABLE IF NOT EXISTS public.animasign_finalization_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL UNIQUE
    REFERENCES public.anamnese_submissions(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL,
  form_version text NOT NULL,
  signature_sha256 text NOT NULL CHECK (signature_sha256 ~ '^[a-f0-9]{64}$'),
  pdf_sha256 text NOT NULL CHECK (pdf_sha256 ~ '^[a-f0-9]{64}$'),
  sealed_pdf_sha256 text NOT NULL CHECK (sealed_pdf_sha256 ~ '^[a-f0-9]{64}$'),
  abschluss_ort text NOT NULL CHECK (length(btrim(abschluss_ort)) BETWEEN 1 AND 200),
  abschluss_datum date NOT NULL,
  certificate_subject text NOT NULL,
  certificate_issuer text NOT NULL,
  certificate_serial_number text NOT NULL,
  certificate_valid_from timestamptz NOT NULL,
  certificate_valid_to timestamptz NOT NULL,
  certificate_fingerprint_sha256 text NOT NULL
    CHECK (certificate_fingerprint_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.animasign_finalization_records IS
  'Unveränderliches Abschlussprotokoll für Anamnesebögen mit gespeicherter Formularunterschrift.';
COMMENT ON COLUMN public.animasign_finalization_records.pdf_sha256 IS
  'SHA-256 des vollständigen sichtbaren PDFs unmittelbar vor der X.509-Versiegelung.';
COMMENT ON COLUMN public.animasign_finalization_records.sealed_pdf_sha256 IS
  'SHA-256 der endgültig gespeicherten, X.509-versiegelten PDF-Datei.';

ALTER TABLE public.animasign_finalization_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS animasign_finalization_service_read
  ON public.animasign_finalization_records;
CREATE POLICY animasign_finalization_service_read
  ON public.animasign_finalization_records
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS animasign_finalization_service_insert
  ON public.animasign_finalization_records;
CREATE POLICY animasign_finalization_service_insert
  ON public.animasign_finalization_records
  FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reject_animasign_finalization_record_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'animasign_finalization_records are immutable';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_animasign_finalization_record_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_animasign_finalization_records_immutable
  ON public.animasign_finalization_records;
CREATE TRIGGER trg_animasign_finalization_records_immutable
BEFORE UPDATE OR DELETE ON public.animasign_finalization_records
FOR EACH ROW EXECUTE FUNCTION public.reject_animasign_finalization_record_change();

REVOKE ALL ON TABLE public.animasign_finalization_records
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.animasign_finalization_records
  TO service_role;

