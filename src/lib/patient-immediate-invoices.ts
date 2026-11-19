import "server-only";

export type ImmediateInvoice = {
  id: string; patientId: string; invoiceNumber: string; invoiceDate: string;
  positions: Array<Record<string, unknown>>; totalCents: number; receivedCents: number;
  paymentStatus: "paid" | "part_paid" | "awaiting_bank" | "unpaid"; pdfUrl: string;
};
const endpoint = "https://anima-leitstand.vercel.app/api/patient/internal/immediate-invoices";

async function internalRequest(body: Record<string, unknown>) {
  const secret = process.env.INVOICE_ACCESS_WORKER_SECRET;
  if (!secret) throw new Error("immediate_invoice_not_configured");
  const response = await fetch(endpoint, { method: "POST", headers: {
    "content-type": "application/json", "x-invoice-worker-secret": secret,
  }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10000) });
  return response;
}

export async function loadPatientImmediateInvoices(patientIds: string[]): Promise<ImmediateInvoice[]> {
  if (!patientIds.length || patientIds.length > 20) throw new Error("immediate_invoice_patient_limit");
  const response = await internalRequest({ patientIds });
  if (!response.ok) throw new Error("immediate_invoice_unavailable");
  const body = await response.json();
  if (!body || !Array.isArray(body.items)) throw new Error("immediate_invoice_invalid_response");
  const allowed = new Set(patientIds);
  return body.items.filter((item: ImmediateInvoice) => allowed.has(item.patientId));
}

export async function loadPatientImmediateInvoicePdf(patientId: string, documentId: string): Promise<Response> {
  return internalRequest({ patientId, documentId, format: "pdf" });
}
