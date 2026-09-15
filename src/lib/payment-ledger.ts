export const AUTO_CONFIRM_THRESHOLD = 75;

export type PatientAllocationState =
  | "candidate"
  | "confirmed_auto"
  | "confirmed_manual"
  | "rejected"
  | "reversed";

export type PatientAllocation = {
  id: string;
  transactionId: string;
  patientId: string;
  amountCents: number;
  state: PatientAllocationState;
  confidenceScore: number;
  reversalOfAllocationId?: string | null;
};

export type InvoiceAmount = {
  id: string;
  amountCents: number;
};

export function canAutoConfirm(confidenceScore: number, candidateCount: number) {
  return confidenceScore >= AUTO_CONFIRM_THRESHOLD && candidateCount === 1;
}

export function activeConfirmedAllocations(allocations: PatientAllocation[]) {
  const reversed = new Set(
    allocations
      .filter((allocation) => allocation.state === "reversed" && allocation.reversalOfAllocationId)
      .map((allocation) => allocation.reversalOfAllocationId as string)
  );
  return allocations.filter((allocation) =>
    (allocation.state === "confirmed_auto" || allocation.state === "confirmed_manual") &&
    !reversed.has(allocation.id)
  );
}

export function calculatePatientLedgerPosition(
  invoices: InvoiceAmount[],
  allocations: PatientAllocation[]
) {
  const invoiceCents = invoices.reduce((sum, invoice) => sum + invoice.amountCents, 0);
  const confirmedPaymentCents = activeConfirmedAllocations(allocations)
    .reduce((sum, allocation) => sum + allocation.amountCents, 0);
  const netPositionCents = invoiceCents - confirmedPaymentCents;
  return {
    invoiceCents,
    confirmedPaymentCents,
    netPositionCents,
    openCents: Math.max(0, netPositionCents),
    creditCents: Math.max(0, -netPositionCents),
  };
}

export function validateTransactionCapacity(transactionAmountCents: number, allocations: PatientAllocation[]) {
  const total = activeConfirmedAllocations(allocations)
    .reduce((sum, allocation) => sum + allocation.amountCents, 0);
  return {
    valid: total <= transactionAmountCents,
    allocatedCents: total,
    remainingCents: transactionAmountCents - total,
  };
}

