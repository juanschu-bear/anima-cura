export type HoldClient = {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): PromiseLike<{
        data: Array<{ patient_id: string }> | null;
        error: { message: string } | null;
      }>;
    };
  };
};

export const PAYMENT_REMINDER_TRIGGERS = new Set([
  "rate_ueberfaellig",
  "rate_faellig_bald",
]);

/**
 * A missing or unreadable hold register must stop payment reminders. Continuing
 * would risk contacting a family before the practice has handed over its Q3 invoice.
 */
export async function loadActiveInvoiceDeliveryHoldPatientIds(db: HoldClient) {
  const result = await db
    .from("invoice_delivery_holds")
    .select("patient_id")
    .eq("status", "active");

  if (result.error) {
    throw new Error(`Invoice delivery holds unavailable: ${result.error.message}`);
  }

  return new Set((result.data ?? []).map((row) => row.patient_id));
}

export function isPaymentReminderTrigger(value: string | null | undefined) {
  return typeof value === "string" && PAYMENT_REMINDER_TRIGGERS.has(value);
}
