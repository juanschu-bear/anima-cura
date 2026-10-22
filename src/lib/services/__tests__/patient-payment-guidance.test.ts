import assert from "node:assert/strict";
import test from "node:test";
import { projectInvoicePaymentGuidance } from "../../patient-payment-guidance";

test("applies credit to the oldest invoice first", () => {
  const result = projectInvoicePaymentGuidance([
    { id: "new", rechnung_datum: "2026-10-01", betrag: 100, offen: 100, gezahlt: 0 },
    { id: "old", rechnung_datum: "2026-09-01", betrag: 80, offen: 80, gezahlt: 0 },
  ], 90, false);

  assert.deepEqual(result.map((item) => ({
    id: item.id,
    credit: item.guthaben_angerechnet,
    due: item.zahlbetrag,
    mode: item.zahlungsmodus,
  })), [
    { id: "new", credit: 10, due: 90, mode: "manual" },
    { id: "old", credit: 80, due: 0, mode: "credit" },
  ]);
});

test("blocks manual payment when an active direct debit covers the remainder", () => {
  const [invoice] = projectInvoicePaymentGuidance([
    { id: "invoice", rechnung_datum: "2026-10-01", betrag: 180, offen: 180, gezahlt: 0 },
  ], 90, true);

  assert.equal(invoice.guthaben_angerechnet, 90);
  assert.equal(invoice.einzugsbetrag, 90);
  assert.equal(invoice.zahlbetrag, 90);
  assert.equal(invoice.zahlungsmodus, "direct_debit");
  assert.equal(invoice.manuelle_zahlung_erlaubt, false);
});

test("keeps settled invoices paid and does not consume credit", () => {
  const [invoice] = projectInvoicePaymentGuidance([
    { id: "paid", rechnung_datum: "2026-10-01", betrag: 100, offen: 0, gezahlt: 100 },
  ], 50, true);

  assert.equal(invoice.guthaben_angerechnet, 0);
  assert.equal(invoice.zahlbetrag, 0);
  assert.equal(invoice.zahlungsmodus, "paid");
});
