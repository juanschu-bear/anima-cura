-- ============================================================
-- Migration 028: Bootstrap kassen_zahlungen
-- ============================================================
-- Diese Datei ist fuer Datenbanken gedacht, in denen
-- kassen_zahlungen bisher noch nie angelegt wurde.
-- Sie erzeugt die Tabelle im aktuellen Zielzustand inklusive
-- Belegnummern-Trigger, Basis-Indizes und RLS-Policy.
-- ============================================================

CREATE TABLE IF NOT EXISTS kassen_zahlungen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  transaktion_id uuid REFERENCES transaktionen(id) ON DELETE SET NULL,
  kassen_datum date NOT NULL DEFAULT CURRENT_DATE,
  betrag numeric(10,2) NOT NULL CHECK (betrag >= 0),
  buchungstyp text NOT NULL DEFAULT 'einnahme' CHECK (buchungstyp IN ('einnahme', 'ausgabe')),
  zahlart text NOT NULL CHECK (zahlart IN ('qr_ueberweisung', 'girocard', 'kreditkarte', 'bar', 'guthaben')),
  zeichen text,
  zweck text,
  notiz text,
  abgleich_status text,
  eingang_am timestamptz,
  eingang_typ text,
  beleg_nr text,
  quartal_jahr integer,
  quartal_nummer smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kassen_zahlungen_quartal_nummer_check CHECK (quartal_nummer IS NULL OR quartal_nummer BETWEEN 1 AND 4),
  CONSTRAINT kassen_zahlungen_quartal_kombination_check CHECK (
    (quartal_jahr IS NULL AND quartal_nummer IS NULL)
    OR
    (quartal_jahr IS NOT NULL AND quartal_nummer IS NOT NULL)
  )
);

ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS patient_id uuid REFERENCES patients(id) ON DELETE SET NULL;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS transaktion_id uuid REFERENCES transaktionen(id) ON DELETE SET NULL;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS kassen_datum date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS betrag numeric(10,2);
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS buchungstyp text NOT NULL DEFAULT 'einnahme';
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS zahlart text;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS zeichen text;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS zweck text;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS notiz text;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS abgleich_status text;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS eingang_am timestamptz;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS eingang_typ text;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS beleg_nr text;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS quartal_jahr integer;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS quartal_nummer smallint;
ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_buchungstyp_check;
ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_buchungstyp_check
  CHECK (buchungstyp IN ('einnahme', 'ausgabe'));

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_zahlart_check;
ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_zahlart_check
  CHECK (zahlart IN ('qr_ueberweisung', 'girocard', 'kreditkarte', 'bar', 'guthaben'));

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_betrag_check;
ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_betrag_check
  CHECK (betrag >= 0);

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

CREATE INDEX IF NOT EXISTS idx_kassen_zahlungen_datum
  ON kassen_zahlungen (kassen_datum DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kassen_zahlungen_patient
  ON kassen_zahlungen (patient_id, kassen_datum DESC);

CREATE INDEX IF NOT EXISTS idx_kassen_zahlungen_transaktion
  ON kassen_zahlungen (transaktion_id);

CREATE INDEX IF NOT EXISTS idx_kassen_zahlungen_buchungstyp
  ON kassen_zahlungen (buchungstyp, kassen_datum DESC);

CREATE INDEX IF NOT EXISTS idx_kassen_zahlungen_quartal
  ON kassen_zahlungen (quartal_jahr, quartal_nummer);

CREATE SEQUENCE IF NOT EXISTS kassen_beleg_seq START 1;

CREATE OR REPLACE FUNCTION kassen_beleg_nr()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.beleg_nr IS NULL THEN
    NEW.beleg_nr := 'KB-' || to_char(COALESCE(NEW.created_at, now()), 'YYYY') || '-'
      || lpad(nextval('kassen_beleg_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kassen_beleg_nr ON kassen_zahlungen;
CREATE TRIGGER trg_kassen_beleg_nr
  BEFORE INSERT ON kassen_zahlungen
  FOR EACH ROW EXECUTE FUNCTION kassen_beleg_nr();

UPDATE kassen_zahlungen
SET beleg_nr = 'KB-' || to_char(COALESCE(created_at, now()), 'YYYY') || '-'
  || lpad(nextval('kassen_beleg_seq')::text, 4, '0')
WHERE beleg_nr IS NULL;

ALTER TABLE kassen_zahlungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users full access" ON kassen_zahlungen;
CREATE POLICY "Authenticated users full access"
  ON kassen_zahlungen
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
