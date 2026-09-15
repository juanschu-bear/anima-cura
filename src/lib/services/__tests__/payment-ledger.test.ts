import assert from "node:assert/strict";
import test from "node:test";

import {
  activeConfirmedAllocations,
  calculatePatientLedgerPosition,
  canAutoConfirm,
  validateTransactionCapacity,
  type PatientAllocation,
} from "../../payment-ledger";

const allocation = (overrides: Partial<PatientAllocation> = {}): PatientAllocation => ({
  id: "allocation-1",
  transactionId: "transaction-1",
  patientId: "patient-1",
  amountCents: 10_000,
  state: "confirmed_auto",
  confidenceScore: 75,
  ...overrides,
});

test("75 percent confirms only one unambiguous patient", () => {
  assert.equal(canAutoConfirm(75, 1), true);
  assert.equal(canAutoConfirm(74, 1), false);
  assert.equal(canAutoConfirm(100, 2), false);
});

test("confirmed patient payment reduces total balance without invoice allocation", () => {
  const result = calculatePatientLedgerPosition(
    [{ id: "invoice-1", amountCents: 45_220 }],
    [allocation({ amountCents: 45_000 })]
  );
  assert.deepEqual(result, {
    invoiceCents: 45_220,
    confirmedPaymentCents: 45_000,
    netPositionCents: 220,
    openCents: 220,
    creditCents: 0,
  });
});

test("candidate below threshold does not affect patient balance", () => {
  const result = calculatePatientLedgerPosition(
    [{ id: "invoice-1", amountCents: 45_220 }],
    [allocation({ state: "candidate", confidenceScore: 74, amountCents: 45_220 })]
  );
  assert.equal(result.confirmedPaymentCents, 0);
  assert.equal(result.openCents, 45_220);
});

test("overpayment becomes credit instead of negative open debt", () => {
  const result = calculatePatientLedgerPosition(
    [{ id: "invoice-1", amountCents: 10_000 }],
    [allocation({ amountCents: 12_500 })]
  );
  assert.equal(result.openCents, 0);
  assert.equal(result.creditCents, 2_500);
});

test("reversal removes the original payment from the active ledger", () => {
  const original = allocation();
  const reversal = allocation({
    id: "reversal-1",
    state: "reversed",
    reversalOfAllocationId: original.id,
  });
  assert.deepEqual(activeConfirmedAllocations([original, reversal]), []);
});

test("split allocations cannot exceed the bank transaction", () => {
  const splits = [
    allocation({ id: "split-1", patientId: "child-1", amountCents: 6_000 }),
    allocation({ id: "split-2", patientId: "child-2", amountCents: 4_000 }),
  ];
  assert.deepEqual(validateTransactionCapacity(10_000, splits), {
    valid: true,
    allocatedCents: 10_000,
    remainingCents: 0,
  });
  assert.equal(validateTransactionCapacity(9_999, splits).valid, false);
});

