-- ============================================================
-- Migration 016: Anima Sign, Anamnese-Einreichungen
-- ============================================================
-- Speichert jede ueber die Plattform ausgefuellte Anamnese:
-- die Antworten als JSON, den Signatur-Status ueber Documenso
-- und den Uebertragungsstatus nach ivoris. patient_id ist
-- bewusst nullable, weil ein neuer Patient zum Zeitpunkt der
-- Einreichung noch nicht in der patients-Tabelle stehen muss.
-- ============================================================

CREATE TABLE IF NOT EXISTS anamnese_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id),

  -- Denormalisierte Eckdaten des Unterzeichners (Matching und Documenso)
  vorname text,
  nachname text,
  geburtsdatum date,
  email text,

  -- Vollstaendige Formularantworten
  answers jsonb NOT NULL,

  -- Lebenszyklus der Einreichung
  status text NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen','signatur_ausstehend','signiert','an_ivoris_uebertragen','fehler')),

  -- Documenso
  documenso_envelope_id text,
  documenso_recipient_token text,
  signed_pdf_path text,
  signiert_am timestamptz,

  -- ivoris
  ivoris_patient_id text,
  ivoris_document_id text,
  ivoris_status text NOT NULL DEFAULT 'offen'
    CHECK (ivoris_status IN ('offen','patient_angelegt','dokument_hochgeladen','fehler')),
  ivoris_uebertragen_am timestamptz,

  fehler_text text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_anamnese_patient
  ON anamnese_submissions (patient_id);
CREATE INDEX IF NOT EXISTS idx_anamnese_status
  ON anamnese_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anamnese_envelope
  ON anamnese_submissions (documenso_envelope_id);

ALTER TABLE anamnese_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anamnese_authenticated ON anamnese_submissions;
CREATE POLICY anamnese_authenticated ON anamnese_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS anamnese_service ON anamnese_submissions;
CREATE POLICY anamnese_service ON anamnese_submissions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Optional, separat: privater Storage-Bucket fuer die
-- versiegelten PDFs. Wenn du Storage lieber ueber das Dashboard
-- anlegst, diesen Block weglassen.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('anamnese-dokumente', 'anamnese-dokumente', false)
ON CONFLICT (id) DO NOTHING;
