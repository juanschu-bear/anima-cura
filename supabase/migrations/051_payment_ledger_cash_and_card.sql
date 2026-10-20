-- Extend the append-only payment ledger to payments recorded at the practice.
-- Bank imports and cash/card receipts remain separate immutable source documents.

BEGIN;

ALTER TABLE kassen_zahlungen
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'gebucht',
  ADD COLUMN IF NOT EXISTS storniert_at timestamptz,
  ADD COLUMN IF NOT EXISTS storniert_by uuid,
  ADD COLUMN IF NOT EXISTS storno_grund text;

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_status_check;
ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_status_check
  CHECK (status IN ('gebucht', 'storniert'));

ALTER TABLE kassen_zahlungen
  DROP CONSTRAINT IF EXISTS kassen_zahlungen_storno_metadata_check;
ALTER TABLE kassen_zahlungen
  ADD CONSTRAINT kassen_zahlungen_storno_metadata_check CHECK (
    (status = 'gebucht' AND storniert_at IS NULL AND storniert_by IS NULL AND storno_grund IS NULL)
    OR
    (status = 'storniert' AND storniert_at IS NOT NULL AND length(trim(storno_grund)) >= 3)
  );

ALTER TABLE payment_patient_allocations
  ALTER COLUMN transaction_id DROP NOT NULL;
ALTER TABLE payment_patient_allocations
  ADD COLUMN IF NOT EXISTS kassen_zahlung_id uuid REFERENCES kassen_zahlungen(id) ON DELETE RESTRICT;

ALTER TABLE payment_patient_allocations
  DROP CONSTRAINT IF EXISTS payment_patient_allocation_one_source;
ALTER TABLE payment_patient_allocations
  ADD CONSTRAINT payment_patient_allocation_one_source CHECK (
    (transaction_id IS NOT NULL)::integer + (kassen_zahlung_id IS NOT NULL)::integer = 1
  );

CREATE INDEX IF NOT EXISTS payment_patient_allocations_kassen_zahlung
  ON payment_patient_allocations(kassen_zahlung_id, state)
  WHERE kassen_zahlung_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_patient_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tx transaktionen%ROWTYPE;
  receipt kassen_zahlungen%ROWTYPE;
  original payment_patient_allocations%ROWTYPE;
  source_amount bigint;
  allocated bigint;
  active_invoice_allocations bigint;
BEGIN
  IF (NEW.transaction_id IS NOT NULL)::integer + (NEW.kassen_zahlung_id IS NOT NULL)::integer <> 1 THEN
    RAISE EXCEPTION 'payment allocation requires exactly one source document';
  END IF;

  IF NEW.transaction_id IS NOT NULL THEN
    SELECT * INTO tx FROM transaktionen WHERE id = NEW.transaction_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'bank transaction not found'; END IF;
    source_amount := round(tx.betrag * 100)::bigint;
    IF source_amount <= 0 THEN
      RAISE EXCEPTION 'only positive incoming transactions can be allocated';
    END IF;
  ELSE
    SELECT * INTO receipt FROM kassen_zahlungen WHERE id = NEW.kassen_zahlung_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'practice payment receipt not found'; END IF;
    IF receipt.buchungstyp <> 'einnahme'
       OR receipt.zahlart NOT IN ('bar', 'girocard', 'kreditkarte')
       OR receipt.patient_id IS NULL THEN
      RAISE EXCEPTION 'only patient cash or card receipts can be allocated';
    END IF;
    IF receipt.patient_id <> NEW.patient_id THEN
      RAISE EXCEPTION 'receipt and payment allocation belong to different patients';
    END IF;
    source_amount := round(receipt.betrag * 100)::bigint;
  END IF;

  IF NEW.state = 'reversed' THEN
    SELECT * INTO original
    FROM payment_patient_allocations
    WHERE id = NEW.reversal_of_allocation_id
    FOR UPDATE;
    IF NOT FOUND OR original.state NOT IN ('confirmed_auto', 'confirmed_manual') THEN
      RAISE EXCEPTION 'reversal must reference a confirmed patient allocation';
    END IF;
    IF NEW.transaction_id IS DISTINCT FROM original.transaction_id
       OR NEW.kassen_zahlung_id IS DISTINCT FROM original.kassen_zahlung_id
       OR NEW.patient_id <> original.patient_id
       OR NEW.amount_cents <> original.amount_cents THEN
      RAISE EXCEPTION 'patient reversal must mirror source, patient and amount';
    END IF;
    SELECT count(*) INTO active_invoice_allocations
    FROM payment_invoice_allocations a
    WHERE a.patient_allocation_id = original.id
      AND a.state IN ('allocated_auto', 'allocated_manual')
      AND NOT EXISTS (
        SELECT 1 FROM payment_invoice_allocations reversal
        WHERE reversal.reversal_of_allocation_id = a.id AND reversal.state = 'reversed'
      );
    IF active_invoice_allocations > 0 THEN
      RAISE EXCEPTION 'reverse invoice allocations before reversing patient allocation';
    END IF;
  END IF;

  IF NEW.state IN ('confirmed_auto', 'confirmed_manual') THEN
    SELECT coalesce(sum(a.amount_cents), 0)::bigint INTO allocated
    FROM payment_patient_allocations a
    WHERE a.transaction_id IS NOT DISTINCT FROM NEW.transaction_id
      AND a.kassen_zahlung_id IS NOT DISTINCT FROM NEW.kassen_zahlung_id
      AND a.state IN ('confirmed_auto', 'confirmed_manual')
      AND a.id <> NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM payment_patient_allocations reversal
        WHERE reversal.reversal_of_allocation_id = a.id AND reversal.state = 'reversed'
      );
    IF allocated + NEW.amount_cents > source_amount THEN
      RAISE EXCEPTION 'confirmed patient allocations exceed source document amount';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_patient_payment_allocation_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patient payment allocations are append-only; reject or reverse instead';
  END IF;
  IF OLD.transaction_id IS DISTINCT FROM NEW.transaction_id
     OR OLD.kassen_zahlung_id IS DISTINCT FROM NEW.kassen_zahlung_id
     OR OLD.patient_id <> NEW.patient_id
     OR OLD.amount_cents <> NEW.amount_cents
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'patient allocation identity and amount are immutable';
  END IF;
  IF OLD.state <> 'candidate' THEN
    RAISE EXCEPTION 'decided patient allocations are immutable; create a reversal instead';
  END IF;
  IF NEW.state NOT IN ('candidate', 'confirmed_auto', 'confirmed_manual', 'rejected') THEN
    RAISE EXCEPTION 'candidate can only remain candidate, be confirmed, or be rejected';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger_record_practice_payment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'gebucht'
     AND NEW.buchungstyp = 'einnahme'
     AND NEW.patient_id IS NOT NULL
     AND NEW.zahlart IN ('bar', 'girocard', 'kreditkarte')
     AND NEW.betrag > 0 THEN
    INSERT INTO payment_patient_allocations (
      source_key, transaction_id, kassen_zahlung_id, patient_id, amount_cents,
      state, confidence_score, evidence, decision_reason, confirmed_at, confirmed_by
    ) VALUES (
      'kasse-v1:' || NEW.id::text, NULL, NEW.id, NEW.patient_id,
      round(NEW.betrag * 100)::bigint, 'confirmed_manual', 100,
      jsonb_build_array(jsonb_build_object(
        'kind', 'practice_receipt',
        'receiptId', NEW.id,
        'paymentDate', NEW.kassen_datum,
        'paymentMethod', NEW.zahlart
      )),
      'Patient wurde bei der Erfassung in der Praxis eindeutig ausgewählt',
      coalesce(NEW.created_at, now()), auth.uid()
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_record_practice_payment_trigger ON kassen_zahlungen;
CREATE TRIGGER ledger_record_practice_payment_trigger
  AFTER INSERT ON kassen_zahlungen
  FOR EACH ROW EXECUTE FUNCTION ledger_record_practice_payment();

-- Historic practice receipts are backfilled by migration 052 after the schema,
-- trigger and voiding workflow are live. Keeping the backfill separate makes a
-- failed data row unable to block the structural migration.

CREATE OR REPLACE FUNCTION void_kassen_zahlung(p_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_role text;
  receipt kassen_zahlungen%ROWTYPE;
  original payment_patient_allocations%ROWTYPE;
BEGIN
  SELECT role INTO actor_role FROM user_profiles WHERE id = auth.uid();
  IF actor_role IS NULL OR actor_role = 'patient' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'storno reason is required';
  END IF;

  SELECT * INTO receipt FROM kassen_zahlungen WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt not found'; END IF;
  IF receipt.status = 'storniert' THEN RETURN; END IF;

  SELECT * INTO original
  FROM payment_patient_allocations a
  WHERE a.kassen_zahlung_id = receipt.id
    AND a.state IN ('confirmed_auto', 'confirmed_manual')
    AND NOT EXISTS (
      SELECT 1 FROM payment_patient_allocations r
      WHERE r.reversal_of_allocation_id = a.id AND r.state = 'reversed'
    )
  ORDER BY a.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    INSERT INTO payment_patient_allocations (
      source_key, transaction_id, kassen_zahlung_id, patient_id, amount_cents,
      state, confidence_score, evidence, decision_reason, confirmed_at,
      confirmed_by, reversal_of_allocation_id
    ) VALUES (
      'kasse-storno-v1:' || receipt.id::text, NULL, receipt.id,
      original.patient_id, original.amount_cents, 'reversed', 100,
      jsonb_build_array(jsonb_build_object('kind', 'practice_receipt_void', 'reason', trim(p_reason))),
      trim(p_reason), now(), auth.uid(), original.id
    ) ON CONFLICT DO NOTHING;
  END IF;

  UPDATE kassen_zahlungen
  SET status = 'storniert', storniert_at = now(), storniert_by = auth.uid(), storno_grund = trim(p_reason)
  WHERE id = receipt.id;
END;
$$;

REVOKE ALL ON FUNCTION void_kassen_zahlung(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_kassen_zahlung(uuid, text) TO authenticated, service_role;

-- Shadow balance rebuilds the economic history from original invoice amounts
-- and confirmed payments. It must not use the mutable legacy `offen` column,
-- otherwise historic payments would be subtracted twice.
CREATE OR REPLACE VIEW patient_finance_ledger_shadow AS
WITH invoices AS (
  SELECT patient_id, coalesce(sum(round(betrag * 100)), 0)::bigint AS invoice_cents
  FROM offene_posten
  WHERE patient_id IS NOT NULL
    AND coalesce(status, '') NOT IN ('erloesminderung', 'storniert')
  GROUP BY patient_id
),
active_payments AS (
  SELECT a.patient_id,
         coalesce(sum(a.amount_cents), 0)::bigint AS confirmed_payment_cents,
         count(*)::bigint AS confirmed_payment_count
  FROM payment_patient_allocations a
  WHERE a.state IN ('confirmed_auto', 'confirmed_manual')
    AND NOT EXISTS (
      SELECT 1 FROM payment_patient_allocations reversal
      WHERE reversal.reversal_of_allocation_id = a.id AND reversal.state = 'reversed'
    )
  GROUP BY a.patient_id
),
invoice_allocated AS (
  SELECT pa.patient_id, coalesce(sum(ia.amount_cents), 0)::bigint AS invoice_allocated_cents
  FROM payment_invoice_allocations ia
  JOIN payment_patient_allocations pa ON pa.id = ia.patient_allocation_id
  WHERE ia.state IN ('allocated_auto', 'allocated_manual')
    AND NOT EXISTS (
      SELECT 1 FROM payment_invoice_allocations reversal
      WHERE reversal.reversal_of_allocation_id = ia.id AND reversal.state = 'reversed'
    )
  GROUP BY pa.patient_id
),
patient_ids AS (
  SELECT patient_id FROM invoices
  UNION SELECT patient_id FROM active_payments
)
SELECT ids.patient_id,
       coalesce(i.invoice_cents, 0) AS invoice_cents,
       coalesce(p.confirmed_payment_cents, 0) AS confirmed_payment_cents,
       coalesce(p.confirmed_payment_count, 0) AS confirmed_payment_count,
       coalesce(ia.invoice_allocated_cents, 0) AS invoice_allocated_cents,
       greatest(0, coalesce(p.confirmed_payment_cents, 0) - coalesce(ia.invoice_allocated_cents, 0)) AS payment_unallocated_to_invoice_cents,
       greatest(0, coalesce(i.invoice_cents, 0) - coalesce(p.confirmed_payment_cents, 0)) AS open_cents,
       greatest(0, coalesce(p.confirmed_payment_cents, 0) - coalesce(i.invoice_cents, 0)) AS credit_cents,
       coalesce(i.invoice_cents, 0) - coalesce(p.confirmed_payment_cents, 0) AS net_position_cents
FROM patient_ids ids
LEFT JOIN invoices i USING (patient_id)
LEFT JOIN active_payments p USING (patient_id)
LEFT JOIN invoice_allocated ia USING (patient_id);

GRANT SELECT ON patient_finance_ledger_shadow TO service_role;

COMMIT;
