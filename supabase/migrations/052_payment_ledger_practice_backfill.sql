-- Backfill historic practice cash/card receipts after the structural ledger
-- migration is live. Idempotency is expressed explicitly because source_key
-- uses a partial unique index and must not be used as an ON CONFLICT target.

BEGIN;

LOCK TABLE payment_patient_allocations IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO payment_patient_allocations (
  source_key, transaction_id, kassen_zahlung_id, patient_id, amount_cents,
  state, confidence_score, evidence, decision_reason, confirmed_at
)
SELECT
  'kasse-v1:' || k.id::text, NULL, k.id, k.patient_id,
  round(k.betrag * 100)::bigint, 'confirmed_manual', 100,
  jsonb_build_array(jsonb_build_object(
    'kind', 'practice_receipt',
    'receiptId', k.id,
    'paymentDate', k.kassen_datum,
    'paymentMethod', k.zahlart
  )),
  'Historischer Praxisbeleg mit eindeutig ausgewähltem Patienten',
  k.created_at
FROM kassen_zahlungen k
WHERE k.status = 'gebucht'
  AND k.buchungstyp = 'einnahme'
  AND k.patient_id IS NOT NULL
  AND k.zahlart IN ('bar', 'girocard', 'kreditkarte')
  AND k.betrag > 0
  AND NOT EXISTS (
    SELECT 1
    FROM payment_patient_allocations a
    WHERE a.source_key = 'kasse-v1:' || k.id::text
       OR a.kassen_zahlung_id = k.id
  );

COMMIT;
