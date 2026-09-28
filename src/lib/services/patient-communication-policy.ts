export const ACTIVATION_WAIT_MS = 24 * 60 * 60 * 1000;
export const INVOICE_CONTACT_DAYS = [3, 14, 28] as const;

/** Repeated submissions do not restart the first-sign-in deadline. */
export function activationDueAt(submissionDates: string[]): number | null {
  const dates = submissionDates.map(Date.parse);
  if (!dates.length || dates.some(date => !Number.isFinite(date))) return null;
  return Math.min(...dates) + ACTIVATION_WAIT_MS;
}

/** Invoice receipt is the anchor, never the import date or previous reminder. */
export function invoiceContactSchedule(receivedAt: string | null) {
  const receipt = receivedAt ? Date.parse(receivedAt) : NaN;
  if (!Number.isFinite(receipt)) return null;
  return INVOICE_CONTACT_DAYS.map(days => ({ days, at: new Date(receipt + days * ACTIVATION_WAIT_MS).toISOString() }));
}
