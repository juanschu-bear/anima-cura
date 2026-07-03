-- ============================================================
-- Migration 027: Kasse um Buchungstyp + strukturiertes Quartal
-- ============================================================
-- Ziel:
-- - Einnahmen und Ausgaben in derselben Kasse fuehren
-- - Quartalsbezug strukturiert speichern statt nur Freitext
-- ============================================================

ALTER TABLE kassen_zahlungen
  ADD COLUMN IF NOT EXISTS buchungstyp text NOT NULL DEFAULT 'einnahme';

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_buchungstyp_check;

ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_buchungstyp_check
  CHECK (buchungstyp IN ('einnahme', 'ausgabe'));

ALTER TABLE kassen_zahlungen
  ADD COLUMN IF NOT EXISTS quartal_jahr integer;

ALTER TABLE kassen_zahlungen
  ADD COLUMN IF NOT EXISTS quartal_nummer smallint;

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_quartal_nummer_check;

ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_quartal_nummer_check
  CHECK (quartal_nummer IS NULL OR quartal_nummer BETWEEN 1 AND 4);

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_quartal_kombination_check;

ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_quartal_kombination_check
  CHECK (
    (quartal_jahr IS NULL AND quartal_nummer IS NULL)
    OR
    (quartal_jahr IS NOT NULL AND quartal_nummer IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_kassen_zahlungen_buchungstyp
  ON kassen_zahlungen (buchungstyp, kassen_datum DESC);

CREATE INDEX IF NOT EXISTS idx_kassen_zahlungen_quartal
  ON kassen_zahlungen (quartal_jahr, quartal_nummer);
