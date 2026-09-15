ALTER TABLE payment_patient_allocations
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_patient_allocations_source_key
  ON payment_patient_allocations(source_key)
  WHERE source_key IS NOT NULL;

ALTER TABLE payment_invoice_allocations
  ADD COLUMN IF NOT EXISTS source_key text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_invoice_allocations_source_key
  ON payment_invoice_allocations(source_key)
  WHERE source_key IS NOT NULL;

