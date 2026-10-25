import assert from "node:assert/strict";
import test from "node:test";
import { resolveRateAmounts, summarizePatientFinance, summarizeRates } from "../../patient-finance";
import { resolveOpenItemAmount, resolveOpenItemStatus, resolvePaidItemAmount } from "../../open-items";

test("Teilzahlungen zählen nur den bestätigten Betrag und den verbleibenden Rest", () => {
  const summary = summarizeRates([
    { betrag: "100.00", bezahlt_betrag: "35.25", status: "teilbezahlt" },
    { betrag: 80, status: "bezahlt" },
  ]);
  assert.equal(summary.restschuld, 64.75);
  assert.equal(summary.bezahltBetrag, 115.25);
  assert.equal(summary.partialCount, 1);
  assert.equal(summary.paidCount, 1);
  assert.deepEqual(resolveRateAmounts({ betrag: 100, status: "teilbezahlt" }), { paid: 0, open: 100 });
});

test("Raten und offene Posten liefern bei gleichen Buchungen dieselben Summen", () => {
  const rates = summarizePatientFinance({ rates: [
    { betrag: 0.3, bezahlt_betrag: 0.1, status: "teilbezahlt" },
    { betrag: 0.1, status: "offen" },
  ] });
  const items = summarizePatientFinance({ openItems: [
    { betrag: 0.3, gezahlt: 0.1, offen: 0.2, status: "teilbezahlt" },
    { betrag: 0.1, gezahlt: 0, offen: 0.1, status: "offen" },
  ] });
  assert.equal(rates.restschuld, 0.3);
  assert.equal(rates.restschuld, items.restschuld);
  assert.equal(rates.bezahltBetrag, items.bezahltBetrag);
});

test("Stornierte Rechnungen sind weder Schuld noch Zahlung", () => {
  const item = { betrag: 100, offen: 100, gezahlt: 100, status: "storniert" };
  assert.equal(resolveOpenItemStatus(item), "storniert");
  assert.equal(resolveOpenItemAmount(item), 0);
  assert.equal(resolvePaidItemAmount(item), 0);
  const summary = summarizePatientFinance({ openItems: [item] });
  assert.equal(summary.totalCount, 0);
  assert.equal(summary.bezahltBetrag, 0);
  assert.equal(summary.restschuld, 0);
});

test("Stornierte Raten und Erlösminderungen erhöhen keine Finanzsumme", () => {
  const summary = summarizeRates([
    { betrag: 100, status: "storniert", mahnstufe: 3 },
    { betrag: 80, status: "erloesminderung" },
  ]);
  assert.equal(summary.totalCount, 0);
  assert.equal(summary.restschuld, 0);
  assert.equal(summary.bezahltBetrag, 0);
  assert.equal(summary.status, "pünktlich");
});

test("Bereits gedeckte Raten erzeugen keinen weiteren Mahnstatus", () => {
  const summary = summarizeRates([{ betrag: 100, bezahlt_betrag: 100, status: "überfällig", mahnstufe: 3 }]);
  assert.equal(summary.restschuld, 0);
  assert.equal(summary.hasOverdue, false);
  assert.equal(summary.maxMahn, 0);
});

test("Überzahlungen werden nicht als negativer offener Betrag verrechnet", () => {
  assert.deepEqual(resolveRateAmounts({ betrag: 100, bezahlt_betrag: 120, status: "bezahlt" }), { paid: 120, open: 0 });
});

test("Ungeprüfte Posten lösen keinen Rückfall auf historische Ratenschulden aus", () => {
  const summary = summarizePatientFinance({
    rates: [{ betrag: 500, status: "offen" }],
    openItems: [{ betrag: 500, offen: 500, nicht_mahnen: true }],
  });
  assert.equal(summary.source, "open_items");
  assert.equal(summary.restschuld, 0);
});
