import { resolveOpenItemAmount } from "@/lib/open-items";

export type PatientPaymentMode = "paid" | "credit" | "direct_debit" | "manual";

type InvoiceLike = {
  id: string;
  rechnung_datum?: string | null;
  betrag?: number | null;
  offen?: number | null;
  gezahlt?: number | null;
  status?: string | null;
};

export type InvoicePaymentGuidance<T extends InvoiceLike> = T & {
  guthaben_angerechnet: number;
  zahlbetrag: number;
  einzugsbetrag: number;
  zahlungsmodus: PatientPaymentMode;
  manuelle_zahlung_erlaubt: boolean;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Projects the patient's available credit onto open invoices in FIFO order.
 * This is deliberately read-only: the actual ledger remains the source of truth.
 */
export function projectInvoicePaymentGuidance<T extends InvoiceLike>(
  invoices: T[],
  availableCredit: number,
  hasActiveDirectDebit: boolean,
): InvoicePaymentGuidance<T>[] {
  let remainingCredit = Math.max(0, roundMoney(Number(availableCredit) || 0));
  const oldestFirst = [...invoices].sort((a, b) => {
    const dateA = a.rechnung_datum ? new Date(a.rechnung_datum).getTime() : 0;
    const dateB = b.rechnung_datum ? new Date(b.rechnung_datum).getTime() : 0;
    return dateA - dateB || a.id.localeCompare(b.id);
  });
  const projected = new Map<string, InvoicePaymentGuidance<T>>();

  for (const invoice of oldestFirst) {
    const openAmount = roundMoney(resolveOpenItemAmount(invoice));
    const creditApplied = roundMoney(Math.min(openAmount, remainingCredit));
    const outstanding = roundMoney(Math.max(0, openAmount - creditApplied));
    remainingCredit = roundMoney(Math.max(0, remainingCredit - creditApplied));

    let paymentMode: PatientPaymentMode = "manual";
    if (openAmount <= 0.009) paymentMode = "paid";
    else if (outstanding <= 0.009) paymentMode = "credit";
    else if (hasActiveDirectDebit) paymentMode = "direct_debit";

    projected.set(invoice.id, {
      ...invoice,
      guthaben_angerechnet: creditApplied,
      zahlbetrag: outstanding,
      einzugsbetrag: paymentMode === "direct_debit" ? outstanding : 0,
      zahlungsmodus: paymentMode,
      manuelle_zahlung_erlaubt: paymentMode === "manual",
    });
  }

  return invoices.map((invoice) => projected.get(invoice.id)!);
}
