export type InvoiceSource = { id: string; patient_id: string | null; unser_zeichen: string | null;
  betrag: number | null; gezahlt: number | null; offen: number | null; status: string | null;
  rechnung_datum: string | null; bezahlt_am: string | null; nicht_mahnen: boolean | null };
export type PaymentSource = { id: string; patient_id: string; transaction_id: string; amount_cents: number;
  state: string; source_key: string | null; reversal_of_allocation_id?: string | null };
export type BankSource = { id: string; betrag: number; datum: string; verwendungszweck: string | null;
  matching_status: string | null; matched_patient_id: string | null };

export function invoiceReferences(text: string | null): string[] {
  return Array.from(new Set(Array.from((text || "").matchAll(/(?<!\d)(\d{8})\s*-\s*(\d+)\s*[/.]\s*(\d{4})(?:\s*-\s*(\d+))?(?!\d)/g))
    .map(m => `${m[1]}-${Number(m[2])}/${m[3]}${m[4] ? `-${Number(m[4])}` : ""}`)));
}

/** Builds a conservative, read-only proof: never adds ledger payments to an existing paid total. */
export function planInvoiceReconciliation(invoices: InvoiceSource[], payments: PaymentSource[], banks: BankSource[], usedPaymentIds: Set<string>, usedInvoiceIds = new Set<string>()) {
  const byReference = new Map<string, InvoiceSource[]>();
  for (const invoice of invoices) {
    const refs = invoiceReferences(invoice.unser_zeichen);
    if (refs.length !== 1) continue;
    byReference.set(refs[0], [...(byReference.get(refs[0]) || []), invoice]);
  }
  const bankMap = new Map(banks.map(b => [b.id, b]));
  const reversed = new Set(payments.filter(p => p.state === "reversed").map(p => p.reversal_of_allocation_id));
  const reasons: Record<string, number> = {};
  const missingInvoiceYears: Record<string, number> = {};
  const skip = (reason: string, count = 1) => { reasons[reason] = (reasons[reason] || 0) + count; };
  const groups = new Map<string, { invoice: InvoiceSource; payments: Array<{ allocation: PaymentSource; bank: BankSource }> }>();
  for (const payment of payments) {
    if (!payment.source_key?.startsWith("verified-bank-v1:") || payment.state !== "confirmed_auto" || reversed.has(payment.id)) continue;
    if (usedPaymentIds.has(payment.id)) { skip("prior_invoice_decision"); continue; }
    const bank = bankMap.get(payment.transaction_id);
    if (!bank || bank.matched_patient_id !== payment.patient_id || !["auto", "manuell"].includes(bank.matching_status || "")
      || Math.round(Number(bank.betrag)*100) !== Number(payment.amount_cents)) { skip("bank_source_changed"); continue; }
    const refs = invoiceReferences(bank.verwendungszweck);
    if (refs.length !== 1) { skip(refs.length ? "multiple_invoice_references" : "no_invoice_reference"); continue; }
    const matches = byReference.get(refs[0]) || [];
    if (matches.length !== 1) {
      skip(matches.length ? "ambiguous_invoice_reference" : "invoice_not_found");
      if (!matches.length) { const year=refs[0].match(/\/(\d{4})/)![1]; missingInvoiceYears[year]=(missingInvoiceYears[year]||0)+1; }
      continue;
    }
    const invoice = matches[0];
    if (usedInvoiceIds.has(invoice.id)) { skip("prior_invoice_history"); continue; }
    if (invoice.patient_id !== payment.patient_id) { skip("patient_conflict"); continue; }
    if (invoice.nicht_mahnen || !["offen", "teilbezahlt", "bezahlt", "überfällig", "ueberfaellig"].includes(invoice.status || "")) { skip("invoice_not_confirmed"); continue; }
    if (!invoice.rechnung_datum || !bank.datum || bank.datum.slice(0,10) < invoice.rechnung_datum.slice(0,10)) { skip("payment_before_invoice"); continue; }
    const group = groups.get(invoice.id) || { invoice, payments: [] };
    group.payments.push({ allocation: payment, bank });
    groups.set(invoice.id, group);
  }
  const plans = [];
  const amountConflicts = [];
  for (const group of Array.from(groups.values())) {
    const { invoice } = group;
    const gross = Math.round(Number(invoice.betrag)*100), paid = Math.round(Number(invoice.gezahlt)*100), open = Math.round(Number(invoice.offen)*100);
    const bankCents = group.payments.reduce((sum, p) => sum + Number(p.allocation.amount_cents), 0);
    if ([invoice.betrag, invoice.gezahlt, invoice.offen].some(n => n == null || !Number.isFinite(Number(n)))
      || gross <= 0 || paid < 0 || open < 0 || paid + open !== gross) { skip("inconsistent_invoice_amounts", group.payments.length); amountConflicts.push(group); continue; }
    if (bankCents > gross) { skip("payments_exceed_invoice", group.payments.length); continue; }
    // max(), not addition: existing paid totals may already contain these same bank sources.
    const targetPaidCents = Math.max(paid, bankCents);
    plans.push({ ...group, bankCents, targetPaidCents, targetOpenCents: gross-targetPaidCents, changeCents: targetPaidCents-paid });
  }
  return { plans, reasons, amountConflicts, missingInvoiceYears };
}
