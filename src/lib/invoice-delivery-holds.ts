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

export const INVOICE_DELIVERY_FAILURE_EVENTS = new Set(["failed", "bounced", "suppressed", "complained"]);

export function invoiceDocumentQuarter(name: string) {
  const direct = name.match(/Rechnung\s+([1-4])\s*\/\s*(20\d{2})/i);
  if (direct) return `${direct[2]}-Q${direct[1]}`;
  const labeled = name.match(/Rechnung\s+Q([1-4])\s+(20\d{2})/i);
  return labeled ? `${labeled[2]}-Q${labeled[1]}` : null;
}

type FailureHoldClient = {
  from(table: string): any;
};

/** A provider rejection or spam complaint blocks reminders until the practice records invoice handoff. */
export async function holdRejectedInvoiceDelivery(db: FailureHoldClient, messageId: string, eventType: string) {
  if (!INVOICE_DELIVERY_FAILURE_EVENTS.has(eventType)) return { held: 0 };
  const message = await db.from("communication_messages").select("patient_id,metadata").eq("id", messageId).maybeSingle();
  if (message.error || !message.data) throw new Error("invoice_delivery_message_unavailable");
  const metadata = message.data.metadata && typeof message.data.metadata === "object" ? message.data.metadata as Record<string, unknown> : {};
  const documentIds = Array.isArray(metadata.documentIds)
    ? Array.from(new Set(metadata.documentIds.filter((id): id is string => typeof id === "string")))
    : [];
  return holdInvoiceDocuments(db, documentIds, eventType);
}

export async function holdInvoiceDocuments(db: FailureHoldClient, documentIds: string[], eventType: string) {
  if (!INVOICE_DELIVERY_FAILURE_EVENTS.has(eventType) || !documentIds.length) return { held: 0 };
  const documents = await db.from("patient_documents").select("id,patient_id,name").in("id", documentIds);
  if (documents.error) throw new Error("invoice_delivery_documents_unavailable");
  const reason = eventType === "complained" ? "email_complaint" : "email_rejected";
  const rows = (documents.data ?? []).flatMap((document: { id: string; patient_id: string; name: string }) => {
    const quarter = invoiceDocumentQuarter(document.name ?? "");
    return quarter ? [{ patient_id: document.patient_id, document_id: document.id, quarter, reason, status: "active" }] : [];
  });
  if (!rows.length) return { held: 0 };
  const inserted = await db.from("invoice_delivery_holds").upsert(rows, {
    onConflict: "document_id,quarter",
    ignoreDuplicates: true,
  });
  if (inserted.error?.code === "23514") {
    // The older hold constraint still protects the patient during rollout.
    const fallback = await db.from("invoice_delivery_holds").upsert(
      rows.map((row: { patient_id: string; document_id: string; quarter: string; reason: string; status: string }) => ({ ...row, reason: "no_usable_email" })),
      { onConflict: "document_id,quarter", ignoreDuplicates: true },
    );
    if (fallback.error) throw new Error("invoice_delivery_hold_failed");
  } else if (inserted.error) {
    throw new Error("invoice_delivery_hold_failed");
  }
  return { held: rows.length };
}

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
