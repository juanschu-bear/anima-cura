ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_zahlart_check;

ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_zahlart_check
  CHECK (zahlart IN ('qr_ueberweisung', 'ueberweisung', 'girocard', 'kreditkarte', 'bar', 'guthaben'));
