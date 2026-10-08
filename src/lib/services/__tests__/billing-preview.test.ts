import test from "node:test";
import assert from "node:assert/strict";
import { parseBillingPreview, formatBillingServiceDate } from "../../billing-preview";
import { prepareScribeBillingExport } from "../../billing-foundation";

const preview = {
  patient: { id: "00000000-0000-4000-8000-000000000001", name: "Testperson" },
  patientArt: "privat",
  positionen: [{ goz_nr: "6100", bezeichnung: "Testleistung", faktor: 2.3, anzahl: 1,
    preis: 21.34, gkv_abzug: 0, endpreis: 21.34, begruendung: "" }],
  gesamtEndpreis: 21.34, gesamtGKV: 0, gesamtBrutto: 21.34,
  ratenAnzahl: 1, rateProMonat: 21.34, startDatum: "2026-10-08", paketName: "Testentwurf",
};

test("valid visual drafts remain available without an issued invoice number", () => {
  const result = parseBillingPreview(JSON.stringify({ ...preview, invoiceNumber: "injected" }));
  assert.ok(result);
  assert.equal("invoiceNumber" in result, false);
});

test("broken or extreme browser storage cannot crash the preview", () => {
  for (const raw of [null, "{", "null", "{}", "[]", "x".repeat(2_000_001), JSON.stringify({ ...preview, positionen: [{ ...preview.positionen[0], faktor: "oops" }] })]) {
    assert.equal(parseBillingPreview(raw), null);
  }
});

test("Scribe export never fabricates quantities, expands groups or silently drops rows", () => {
  for (const raw of [null, [], [null], [{ code: "BEMA 126a", text: "Test" }],
    [{ code: "BEMA 119/120", text: "Test", anzahl: 1 }],
    [{ code: "BEMA 126a ×6", text: "Test", anzahl: 1 }],
    [{ code: "BEMA 126a", text: "Test", anzahl: 0 }],
    [{ code: "BEMA 126a", text: "Test\nGOZ 6100", anzahl: 1 }],
    [{ code: "BEMA 126a", text: "Test", anzahl: 1 }, null]]) {
    assert.equal(prepareScribeBillingExport(raw).ok, false);
    assert.equal(prepareScribeBillingExport(raw).copyText, "");
  }
});

test("valid explicit Scribe positions keep the existing clipboard format", () => {
  const result = prepareScribeBillingExport([{ code: "BEMA 126a", text: "Testleistung", anzahl: 6 }]);
  assert.equal(result.ok, true);
  assert.equal(result.copyText, "BEMA 126a x6\tTestleistung");
});

test("service dates cannot shift to the previous day in American timezones", () => {
  assert.equal(formatBillingServiceDate("2026-07-05", "de", true), "05.07.26");
  assert.equal(formatBillingServiceDate("2026-07-05", "de"), "05.07.2026");
  assert.equal(formatBillingServiceDate("2026-02-30", "de"), "");
});
