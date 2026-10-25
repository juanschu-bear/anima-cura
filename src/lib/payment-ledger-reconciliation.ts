import { activeConfirmedAllocations, type PatientAllocation } from "./payment-ledger";
import type { LedgerCandidate, LedgerTransaction } from "./payment-ledger-matching";

export type ReconciliationState = "covered" | "partial" | "overallocated" | "conflict" | "prior_decision" | "ready" | "needs_evidence";

/** Read-only migration gate. A legacy match or a name alone never authorizes backfill. */
export function reconcileLedgerTransaction(
  transaction: LedgerTransaction,
  candidates: LedgerCandidate[],
  history: PatientAllocation[],
) {
  const allocations = history.filter(row => row.transactionId === transaction.id);
  const active = activeConfirmedAllocations(allocations);
  const allocatedCents = active.reduce((sum, row) => sum + row.amountCents, 0);
  const remainingCents = transaction.amountCents - allocatedCents;
  let state: ReconciliationState;
  if (!Number.isSafeInteger(transaction.amountCents) || transaction.amountCents <= 0
    || active.some(row => !Number.isSafeInteger(row.amountCents) || row.amountCents <= 0)) {
    state = "conflict";
  } else if (remainingCents < 0) {
    state = "overallocated";
  } else if (active.length > 0) {
    const evidenceIds = new Set(candidates.map(row => row.patientId));
    const activeIds = new Set(active.map(row => row.patientId));
    const disagrees = Array.from(evidenceIds).some(id => !activeIds.has(id)) || active.some(row =>
      (evidenceIds.size > 0 && !evidenceIds.has(row.patientId))
      || (active.length === 1 && transaction.existingPatientId && transaction.existingPatientId !== row.patientId));
    state = disagrees ? "conflict" : remainingCents === 0 ? "covered" : "partial";
  } else if (allocations.length > 0) {
    // Reversals, rejections and pending decisions must not be silently resurrected.
    state = "prior_decision";
  } else {
    const candidate = candidates.length === 1 ? candidates[0] : null;
    const legacyConflict = candidate && transaction.existingPatientId && candidate.patientId !== transaction.existingPatientId;
    const strongEvidence = candidate?.evidence.some(row => row.kind !== "exact_full_name");
    state = legacyConflict ? "conflict"
      : candidate?.state === "confirmed_auto" && strongEvidence
        && candidate.amountCents === transaction.amountCents
        && (transaction.existingMatchingStatus === "auto" || transaction.existingMatchingStatus === "manuell")
        && transaction.existingPatientId === candidate.patientId ? "ready" : "needs_evidence";
  }
  return { state, allocatedCents, remainingCents, activeCount: active.length };
}
