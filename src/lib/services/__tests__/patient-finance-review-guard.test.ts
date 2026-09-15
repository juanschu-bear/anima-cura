import assert from "node:assert/strict";
import test from "node:test";

import { summarizeOpenItems } from "../../patient-finance";

test("ungepruefte Altposten erscheinen nicht als Patientenschuld", () => {
  const result = summarizeOpenItems([
    { betrag: 452.2, offen: 452.2, gezahlt: 0, status: "offen", nicht_mahnen: true },
    { betrag: 100, offen: 25, gezahlt: 75, status: "teilbezahlt", nicht_mahnen: false },
    { betrag: 80, offen: 0, gezahlt: 80, status: "bezahlt", nicht_mahnen: null },
  ]);

  assert.equal(result.totalCount, 2);
  assert.equal(result.restschuld, 25);
  assert.equal(result.bezahltBetrag, 155);
  assert.equal(result.partialCount, 1);
  assert.equal(result.paidCount, 1);
});

test("ausschliesslich ungepruefte Posten ergeben keine sichtbare Schuld", () => {
  const result = summarizeOpenItems([
    { betrag: 500, offen: 500, gezahlt: 0, status: "offen", nicht_mahnen: true },
  ]);

  assert.equal(result.totalCount, 0);
  assert.equal(result.restschuld, 0);
  assert.equal(result.bezahltBetrag, 0);
  assert.equal(result.status, "pünktlich");
});
