-- Patient payment ledger foundation.
-- Additive only: existing balances and UI remain untouched until shadow parity passes.

CREATE TABLE IF NOT EXISTS payment_patient_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transaktionen(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  state text NOT NULL CHECK (state IN (
    'candidate', 'confirmed_auto', 'confirmed_manual', 'rejected', 'reversed'
  )),
  confidence_score integer NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision_reason text NOT NULL,
  confirmed_at timestamptz,
  confirmed_by uuid,
  reversal_of_allocation_id uuid REFERENCES payment_patient_allocations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_allocation_auto_threshold CHECK (
    state <> 'confirmed_auto' OR confidence_score >= 75
  ),
  CONSTRAINT patient_allocation_confirmation_metadata CHECK (
    state NOT IN ('confirmed_auto', 'confirmed_manual') OR confirmed_at IS NOT NULL
  ),
  CONSTRAINT patient_allocation_reversal_target CHECK (
    (state = 'reversed') = (reversal_of_allocation_id IS NOT NULL)
  ),
  CONSTRAINT patient_allocation_not_self_reversal CHECK (
    reversal_of_allocation_id IS NULL OR reversal_of_allocation_id <> id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_patient_allocation_one_reversal
  ON payment_patient_allocations(reversal_of_allocation_id)
  WHERE reversal_of_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_patient_allocations_transaction
  ON payment_patient_allocations(transaction_id, state);
CREATE INDEX IF NOT EXISTS payment_patient_allocations_patient
  ON payment_patient_allocations(patient_id, state, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_invoice_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_allocation_id uuid NOT NULL REFERENCES payment_patient_allocations(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES offene_posten(id) ON DELETE RESTRICT,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  state text NOT NULL CHECK (state IN ('allocated_auto', 'allocated_manual', 'reversed')),
  allocation_rule text NOT NULL CHECK (allocation_rule IN (
    'exact_reference', 'exact_invoice_number', 'fifo', 'manual', 'reversal'
  )),
  created_by uuid,
  reversal_of_allocation_id uuid REFERENCES payment_invoice_allocations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_allocation_reversal_target CHECK (
    (state = 'reversed') = (reversal_of_allocation_id IS NOT NULL)
  ),
  CONSTRAINT invoice_allocation_reversal_rule CHECK (
    state <> 'reversed' OR allocation_rule = 'reversal'
  ),
  CONSTRAINT invoice_allocation_not_self_reversal CHECK (
    reversal_of_allocation_id IS NULL OR reversal_of_allocation_id <> id
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_invoice_allocation_one_reversal
  ON payment_invoice_allocations(reversal_of_allocation_id)
  WHERE reversal_of_allocation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_invoice_allocations_patient_allocation
  ON payment_invoice_allocations(patient_allocation_id, state);
CREATE INDEX IF NOT EXISTS payment_invoice_allocations_invoice
  ON payment_invoice_allocations(invoice_id, state);

CREATE OR REPLACE FUNCTION validate_patient_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  tx transaktionen%ROWTYPE;
  original payment_patient_allocations%ROWTYPE;
  allocated bigint;
  active_invoice_allocations bigint;
BEGIN
  SELECT * INTO tx FROM transaktionen WHERE id = NEW.transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bank transaction not found'; END IF;
  IF round(tx.betrag * 100)::bigint <= 0 THEN
    RAISE EXCEPTION 'only positive incoming transactions can be allocated';
  END IF;

  IF NEW.state = 'reversed' THEN
    SELECT * INTO original
    FROM payment_patient_allocations
    WHERE id = NEW.reversal_of_allocation_id
    FOR UPDATE;
    IF NOT FOUND OR original.state NOT IN ('confirmed_auto', 'confirmed_manual') THEN
      RAISE EXCEPTION 'reversal must reference a confirmed patient allocation';
    END IF;
    IF NEW.transaction_id <> original.transaction_id
       OR NEW.patient_id <> original.patient_id
       OR NEW.amount_cents <> original.amount_cents THEN
      RAISE EXCEPTION 'patient reversal must mirror transaction, patient and amount';
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
    WHERE a.transaction_id = NEW.transaction_id
      AND a.state IN ('confirmed_auto', 'confirmed_manual')
      AND a.id <> NEW.id
      AND NOT EXISTS (
        SELECT 1 FROM payment_patient_allocations reversal
        WHERE reversal.reversal_of_allocation_id = a.id AND reversal.state = 'reversed'
      );
    IF allocated + NEW.amount_cents > round(tx.betrag * 100)::bigint THEN
      RAISE EXCEPTION 'confirmed patient allocations exceed bank transaction amount';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_patient_payment_allocation_trigger ON payment_patient_allocations;
CREATE TRIGGER validate_patient_payment_allocation_trigger
  BEFORE INSERT OR UPDATE ON payment_patient_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_patient_payment_allocation();

CREATE OR REPLACE FUNCTION protect_patient_payment_allocation_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patient payment allocations are append-only; reject or reverse instead';
  END IF;
  IF OLD.transaction_id <> NEW.transaction_id
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

DROP TRIGGER IF EXISTS protect_patient_payment_allocation_history_trigger ON payment_patient_allocations;
CREATE TRIGGER protect_patient_payment_allocation_history_trigger
  BEFORE UPDATE OR DELETE ON payment_patient_allocations
  FOR EACH ROW EXECUTE FUNCTION protect_patient_payment_allocation_history();

CREATE OR REPLACE FUNCTION validate_invoice_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent payment_patient_allocations%ROWTYPE;
  invoice offene_posten%ROWTYPE;
  original payment_invoice_allocations%ROWTYPE;
  parent_allocated bigint;
  invoice_allocated bigint;
  invoice_capacity bigint;
BEGIN
  SELECT * INTO parent FROM payment_patient_allocations
  WHERE id = NEW.patient_allocation_id FOR UPDATE;
  IF NOT FOUND OR parent.state NOT IN ('confirmed_auto', 'confirmed_manual') THEN
    RAISE EXCEPTION 'invoice allocation requires a confirmed patient allocation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM payment_patient_allocations reversal
    WHERE reversal.reversal_of_allocation_id = parent.id AND reversal.state = 'reversed'
  ) THEN
    RAISE EXCEPTION 'reversed patient allocation cannot be assigned to an invoice';
  END IF;

  SELECT * INTO invoice FROM offene_posten WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invoice not found'; END IF;
  IF invoice.patient_id IS DISTINCT FROM parent.patient_id THEN
    RAISE EXCEPTION 'invoice and payment allocation belong to different patients';
  END IF;
  invoice_capacity := round(coalesce(invoice.betrag, 0) * 100)::bigint;

  IF NEW.state = 'reversed' THEN
    SELECT * INTO original FROM payment_invoice_allocations
    WHERE id = NEW.reversal_of_allocation_id FOR UPDATE;
    IF NOT FOUND OR original.state NOT IN ('allocated_auto', 'allocated_manual') THEN
      RAISE EXCEPTION 'reversal must reference an active invoice allocation';
    END IF;
    IF NEW.patient_allocation_id <> original.patient_allocation_id
       OR NEW.invoice_id <> original.invoice_id
       OR NEW.amount_cents <> original.amount_cents THEN
      RAISE EXCEPTION 'invoice reversal must mirror parent, invoice and amount';
    END IF;
    RETURN NEW;
  END IF;

  SELECT coalesce(sum(a.amount_cents), 0)::bigint INTO parent_allocated
  FROM payment_invoice_allocations a
  WHERE a.patient_allocation_id = NEW.patient_allocation_id
    AND a.state IN ('allocated_auto', 'allocated_manual')
    AND a.id <> NEW.id
    AND NOT EXISTS (
      SELECT 1 FROM payment_invoice_allocations reversal
      WHERE reversal.reversal_of_allocation_id = a.id AND reversal.state = 'reversed'
    );
  IF parent_allocated + NEW.amount_cents > parent.amount_cents THEN
    RAISE EXCEPTION 'invoice allocations exceed confirmed patient allocation';
  END IF;

  SELECT coalesce(sum(a.amount_cents), 0)::bigint INTO invoice_allocated
  FROM payment_invoice_allocations a
  WHERE a.invoice_id = NEW.invoice_id
    AND a.state IN ('allocated_auto', 'allocated_manual')
    AND a.id <> NEW.id
    AND NOT EXISTS (
      SELECT 1 FROM payment_invoice_allocations reversal
      WHERE reversal.reversal_of_allocation_id = a.id AND reversal.state = 'reversed'
    );
  IF invoice_allocated + NEW.amount_cents > invoice_capacity THEN
    RAISE EXCEPTION 'invoice allocations exceed original invoice amount';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_invoice_payment_allocation_trigger ON payment_invoice_allocations;
CREATE TRIGGER validate_invoice_payment_allocation_trigger
  BEFORE INSERT OR UPDATE ON payment_invoice_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_invoice_payment_allocation();

CREATE OR REPLACE FUNCTION protect_invoice_payment_allocation_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'invoice payment allocations are append-only; create a reversal instead';
END;
$$;

DROP TRIGGER IF EXISTS protect_invoice_payment_allocation_history_trigger ON payment_invoice_allocations;
CREATE TRIGGER protect_invoice_payment_allocation_history_trigger
  BEFORE UPDATE OR DELETE ON payment_invoice_allocations
  FOR EACH ROW EXECUTE FUNCTION protect_invoice_payment_allocation_history();

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

ALTER TABLE payment_patient_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_invoice_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_patient_allocations_service_all ON payment_patient_allocations;
CREATE POLICY payment_patient_allocations_service_all ON payment_patient_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS payment_invoice_allocations_service_all ON payment_invoice_allocations;
CREATE POLICY payment_invoice_allocations_service_all ON payment_invoice_allocations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON payment_patient_allocations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON payment_invoice_allocations FROM PUBLIC, anon, authenticated;
GRANT ALL ON payment_patient_allocations TO service_role;
GRANT ALL ON payment_invoice_allocations TO service_role;
GRANT SELECT ON patient_finance_ledger_shadow TO service_role;
