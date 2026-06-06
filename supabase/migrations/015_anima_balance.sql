-- ============================================================
-- Migration 015: Anima Balance, das Fundament
-- ============================================================
-- Guthaben-Buchungstabelle: nur anfuegen, nie ueberschreiben,
-- wie ein Kontoauszug. Saldo = Summe aller Buchungen je Patient.
-- Positive Betraege sind Gutschriften (Aufladung, Ueberzahlung,
-- Erstattung), negative sind Verbrauch (Verrechnung, Auszahlung).
-- ============================================================

CREATE TABLE IF NOT EXISTS anima_balance_buchungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id),
  betrag numeric(10,2) NOT NULL,
  typ text NOT NULL CHECK (typ IN ('aufladung','ueberzahlung','erstattung','verrechnung','auszahlung','korrektur')),
  beschreibung text,
  referenz_transaktion_id bigint,
  referenz_kassen_zahlung_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_patient
  ON anima_balance_buchungen (patient_id, created_at DESC);

ALTER TABLE anima_balance_buchungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS balance_all ON anima_balance_buchungen;
CREATE POLICY balance_all ON anima_balance_buchungen
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS balance_service ON anima_balance_buchungen;
CREATE POLICY balance_service ON anima_balance_buchungen
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Saldo je Patient als Sicht
CREATE OR REPLACE VIEW anima_balance_salden AS
SELECT patient_id, COALESCE(SUM(betrag), 0)::numeric(10,2) AS saldo
FROM anima_balance_buchungen
GROUP BY patient_id;
