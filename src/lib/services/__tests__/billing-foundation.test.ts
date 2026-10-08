import assert from "node:assert/strict";
import test from "node:test";
import { assessBillingCase, calculateLineCents, scribeBillingCandidates, type BillingCase, type BillingLine, type ScribeBillingEntry } from "../../billing-foundation";
import { canReadBilling, loadScribeReadiness, previousBillingQuarter, validBillingPeriod } from "../../billing-readiness";
import { renderBillingReadiness } from "../../billing-readiness-html";

const patient = "00000000-0000-4000-8000-000000000001";
const staff = "00000000-0000-4000-8000-000000000002";
const context: BillingCase = {
  patientId: patient, from: "2026-07-01", to: "2026-09-30", insurerId: "fixture-insurer",
  patientShareBasisPoints: 2000, shareSourceReference: "fixture-confirmed-share",
  expectedPatientCents: 240, scopeConfirmed: true,
};
const line = (overrides: Partial<BillingLine> = {}): BillingLine => ({
  patientId: patient,
  source: { system: "manual", recordId: "fixture-1", version: 1, positionIndex: 0 },
  serviceDate: "2026-07-05", schedule: "BEMA", code: "126a", description: "Testleistung",
  quantity: 1, region: "11", factor: null, justification: null,
  billingConfirmedBy: staff, billingConfirmedAt: "2026-10-08T12:00:00Z",
  tariff: {
    id: "fixture-tariff", version: 1, sourceReference: "TEST ONLY, not a live tariff",
    validFrom: "2026-07-01", validTo: "2026-09-30", schedule: "BEMA", code: "126a",
    insurerId: "fixture-insurer", requiresRegion: true,
    price: { kind: "points", points: "10", pointValueEuro: "1.2" },
  }, ...overrides,
});
const codes = (result: ReturnType<typeof assessBillingCase>) => result.issues.map((issue) => issue.code);
const entry = (overrides: Partial<ScribeBillingEntry> = {}): ScribeBillingEntry => ({
  id: "entry-1", patient_id: patient, version: 1, termin_datum: "2026-07-05",
  status: "bestaetigt", bestaetigt_am: "2026-07-05T12:00:00Z",
  positionen: [{ code: "BEMA 126a", text: "Testleistung", anzahl: 1 }], ...overrides,
});

test("complete evidenced data is ready for review, never automatically issued", () => {
  const result = assessBillingCase(context, [line()]);
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.issuanceAllowed, false);
  assert.equal(result.grossCents, 1200);
  assert.equal(result.patientCents, 240);
  assert.equal(result.differenceCents, 0);
});

test("exact decimal arithmetic avoids half-cent floating point errors", () => {
  assert.equal(calculateLineCents({ kind: "unit", unitPriceEuro: "1.005" }, "1", 1), 101);
  assert.equal(calculateLineCents({ kind: "points", points: "165", pointValueEuro: "0.0562421" }, "2.3", 1), 2134);
  assert.throws(() => calculateLineCents({ kind: "unit", unitPriceEuro: "1e3" }, "1", 1));
  assert.throws(() => calculateLineCents({ kind: "unit", unitPriceEuro: "1" }, "1", 0));
  assert.throws(() => calculateLineCents({ kind: "unit", unitPriceEuro: "999999999" }, "999999999", 10000), /overflow/);
});

test("unknown or partial amounts stay null instead of becoming zero debt", () => {
  const missing = assessBillingCase(context, [line({ tariff: null })]);
  assert.equal(missing.patientCents, null);
  assert.ok(codes(missing).includes("tariff_missing"));
  assert.equal(assessBillingCase(context, []).grossCents, null);
  assert.equal(assessBillingCase(context, [line(), line({ source: { system: "manual", recordId: "other", version: 1, positionIndex: 0 }, tariff: null })]).patientCents, null);
});

test("invalid identity, dates, quantities and missing source are blocking", () => {
  for (const overrides of [{ patientId: staff }, { serviceDate: "2026-10-01" }, { serviceDate: "2026-02-30" }, { quantity: 0 }, { quantity: 1.5 }, { source: null }]) {
    const result = assessBillingCase(context, [{ ...line(), ...overrides }]);
    assert.equal(result.status, "needs_review");
    assert.equal(result.patientCents, null);
  }
});

test("group codes and embedded quantities are not silently expanded", () => {
  for (const code of ["119/120", "126a ×6", "6030–6080"]) {
    assert.ok(codes(assessBillingCase(context, [line({ code })])).includes("code_not_individual"));
  }
});

test("duplicate source lines and mixed revisions cannot be billed twice", () => {
  assert.ok(codes(assessBillingCase(context, [line(), line()])).includes("duplicate_source"));
  const amended = line({ source: { ...line().source, version: 2 } });
  assert.ok(codes(assessBillingCase(context, [line(), amended])).includes("source_version_conflict"));
});

test("tariff scope, insurer, date and required region must match", () => {
  for (const [field, value, reason] of [
    ["validTo", "2026-06-30", "invalid_field"],
    ["validFrom", "2026-08-01", "tariff_expired"],
    ["code", "127a", "tariff_mismatch"],
    ["insurerId", "another-insurer", "insurer_mismatch"],
  ]) {
    const result = assessBillingCase(context, [{ ...line(), tariff: { ...line().tariff!, [field]: value } }]);
    assert.ok(codes(result).includes(reason), reason);
  }
  assert.ok(codes(assessBillingCase(context, [line({ region: null })])).includes("region_missing"));
});

test("GOZ needs evidenced factor and elevated factor explanation", () => {
  const goz = line({ schedule: "GOZ", code: "6100", tariff: { ...line().tariff!, schedule: "GOZ", code: "6100", insurerId: null } });
  assert.ok(codes(assessBillingCase(context, [goz])).includes("factor_missing"));
  assert.ok(codes(assessBillingCase(context, [{ ...goz, factor: "3" }])).includes("justification_missing"));
  assert.ok(codes(assessBillingCase(context, [{ ...goz, factor: "5", justification: "fixture" }])).includes("fee_agreement_review"));
});

test("BEMA patient share cannot silently discount GOZ or a mixed case", () => {
  const goz = line({
    schedule: "GOZ", code: "6100", factor: "1",
    source: { ...line().source, recordId: "private-line" },
    tariff: { ...line().tariff!, schedule: "GOZ", code: "6100", insurerId: null },
  });
  for (const lines of [[goz], [line(), goz]]) {
    const result = assessBillingCase(context, lines);
    assert.ok(codes(result).includes("share_allocation_unsupported"));
    assert.equal(result.patientCents, null);
    assert.equal(result.status, "needs_review");
  }
  const privateCase = assessBillingCase({ ...context, patientShareBasisPoints: 10000, expectedPatientCents: 1200 }, [goz]);
  assert.equal(privateCase.status, "ready_for_review");
  assert.equal(privateCase.patientCents, 1200);
});

test("unknown coverage, share or cent difference stays reviewable", () => {
  assert.ok(codes(assessBillingCase({ ...context, scopeConfirmed: false }, [line()])).includes("scope_unconfirmed"));
  assert.equal(assessBillingCase({ ...context, patientShareBasisPoints: null }, [line()]).patientCents, null);
  assert.equal(assessBillingCase({ ...context, shareSourceReference: null }, [line()]).patientCents, null);
  const mismatch = assessBillingCase({ ...context, expectedPatientCents: 239 }, [line()]);
  assert.ok(codes(mismatch).includes("total_mismatch"));
  assert.equal(mismatch.differenceCents, 1);
  const insured = assessBillingCase({ ...context, patientShareBasisPoints: 0, expectedPatientCents: 0 }, [line()]);
  assert.equal(insured.patientCents, 0);
});

test("Scribe clinical confirmation never supplies billing confirmation or prices", () => {
  const candidates = scribeBillingCandidates([entry()]);
  const candidate = candidates.lines[0] as Record<string, unknown>;
  assert.equal(candidate.billingConfirmedAt, null);
  assert.equal(candidate.tariff, null);
  assert.deepEqual(candidate.source, { system: "scribe", recordId: "entry-1", version: 1, positionIndex: 0 });
  const result = assessBillingCase(context, candidates.lines);
  assert.ok(codes(result).includes("billing_confirmation_missing"));
  assert.ok(codes(result).includes("tariff_missing"));
});

test("empty and malformed Scribe positions stay visible; no default quantity", () => {
  const candidates = scribeBillingCandidates([
    entry({ id: "empty", positionen: [] }),
    entry({ id: "bad", positionen: [null, { code: "BEMA 126a", text: "test" }] }),
    entry({ id: "draft", status: "entwurf" }),
    entry({ id: "unconfirmed", bestaetigt_am: null }),
  ]);
  assert.deepEqual(candidates.entriesWithoutPositions, ["empty"]);
  assert.equal(candidates.lines.length, 2);
  assert.equal((candidates.lines[1] as Record<string, unknown>).quantity, null);
});

test("billing access excludes patients, missing roles and explicit denials", () => {
  assert.equal(canReadBilling("patient", { module: { rechnungen: "schreiben" } }), false);
  assert.equal(canReadBilling(null, { module: { rechnungen: "lesen" } }), false);
  assert.equal(canReadBilling("lesezugriff", null), false);
  assert.equal(canReadBilling("admin", { module: { rechnungen: "keine" } }), false);
  assert.equal(canReadBilling("verwaltung", null), true);
});

test("default period is previous completed quarter in Berlin, including year boundary", () => {
  assert.deepEqual(previousBillingQuarter(new Date("2026-10-08T12:00:00Z")), { from: "2026-07-01", to: "2026-09-30" });
  assert.deepEqual(previousBillingQuarter(new Date("2026-01-01T12:00:00Z")), { from: "2025-10-01", to: "2025-12-31" });
  assert.deepEqual(previousBillingQuarter(new Date("2026-09-30T22:30:00Z")), { from: "2026-07-01", to: "2026-09-30" });
  assert.equal(validBillingPeriod("2026-02-30", "2026-09-30"), false);
  assert.equal(validBillingPeriod("2026-10-01", "2026-09-30"), false);
});

test("readiness paginates and never silently reports a truncated source", async () => {
  const rows = Array.from({ length: 501 }, (_, i) => entry({ id: `entry-${i}` }));
  const calls: number[] = [];
  const result = await loadScribeReadiness(patient, context.from, context.to, async (offset, limit) => {
    calls.push(offset); return rows.slice(offset, offset + limit);
  });
  assert.deepEqual(calls, [0, 250, 500]);
  assert.equal(result.lineCount, 501);
  assert.equal(result.issuanceAllowed, false);
  assert.equal(result.source, "scribe_only");
  assert.equal(result.patientCents, null);
});

test("source errors, foreign patients and pagination shifts fail closed", async () => {
  await assert.rejects(loadScribeReadiness(patient, context.from, context.to, async () => { throw new Error("offline"); }), /offline/);
  await assert.rejects(loadScribeReadiness(patient, context.from, context.to, async () => [entry({ patient_id: staff })]), /scope_mismatch/);
  await assert.rejects(loadScribeReadiness(patient, context.from, context.to, async () => [entry(), entry()]), /changed_during_read/);
  await assert.rejects(loadScribeReadiness(patient, context.from, context.to, async () => null as never), /invalid_source_response/);
});

test("readiness HTML escapes patient content and aggregates repeated issues", async () => {
  const result = await loadScribeReadiness(patient, context.from, context.to, async () => [entry(), entry({ id: "entry-2" })]);
  const html = renderBillingReadiness({ id: patient, name: '<script>alert("test")</script>' }, result, "de");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Keine Rechnung erstellt"));
  assert.ok(html.includes("(2)"));
  assert.ok(!html.includes("billing.issue."));
  assert.ok(renderBillingReadiness({ id: patient, name: "Example" }, result, "en").includes("No invoice issued"));
});
