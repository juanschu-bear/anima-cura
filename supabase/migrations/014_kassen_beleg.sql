-- ============================================================
-- Migration 014: Belegnummern fuer die Kasse (Quittungen)
-- ============================================================
-- Jede Kassen-Zahlung erhaelt automatisch eine fortlaufende
-- Belegnummer KB-<Jahr>-<lfd. Nr.>. Bestehende Eintraege werden
-- nachnummeriert. Die Quittung selbst rendert /kasse/beleg.
-- ============================================================

ALTER TABLE kassen_zahlungen ADD COLUMN IF NOT EXISTS beleg_nr text;

CREATE SEQUENCE IF NOT EXISTS kassen_beleg_seq START 1;

CREATE OR REPLACE FUNCTION kassen_beleg_nr()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.beleg_nr IS NULL THEN
    NEW.beleg_nr := 'KB-' || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('kassen_beleg_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kassen_beleg_nr ON kassen_zahlungen;
CREATE TRIGGER trg_kassen_beleg_nr
  BEFORE INSERT ON kassen_zahlungen
  FOR EACH ROW EXECUTE FUNCTION kassen_beleg_nr();

UPDATE kassen_zahlungen
SET beleg_nr = 'KB-' || to_char(created_at, 'YYYY') || '-'
  || lpad(nextval('kassen_beleg_seq')::text, 4, '0')
WHERE beleg_nr IS NULL;
