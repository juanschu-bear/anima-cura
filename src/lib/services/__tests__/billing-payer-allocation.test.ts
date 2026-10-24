import assert from "node:assert/strict";
import test from "node:test";
import { assessPayerAllocation, type ApprovedBillingLine } from "../../billing-payer-allocation";

const patientId = "1ab0dc07-6209-44c1-bd56-ee5098ddc22e";
const versionId = "21b0dc07-6209-44c1-bd56-ee5098ddc22e";
const line: ApprovedBillingLine = { versionId, patientId, serviceDate: "2026-09-10", schedule: "GOZ", grossCents: 1592, approved: true, current: true };
const input = { patientId, from: "2026-07-01", to: "2026-09-30", serviceVersionIds: [versionId], payerModel: "private_full", patientShareBasisPoints: 10000, shareSourceReference: "Private Selbstzahlerleistung laut Behandlungsvertrag", expectedPatientCents: 1592 };

test("full private allocation becomes eligible only with an exact complete evidenced total", () => {
  assert.deepEqual(assessPayerAllocation(input, [line], [versionId]), { ok: true, issues: [], grossCents: 1592, patientCents: 1592 });
});

test("payer allocation blocks missing lines, stale approval and unexplained total differences", () => {
  assert.ok(assessPayerAllocation({ ...input, expectedPatientCents: 1500 }, [line], [versionId]).issues.includes("expected_total_mismatch"));
  assert.ok(assessPayerAllocation(input, [{ ...line, current: false }], [versionId]).issues.includes("service_not_current"));
  assert.ok(assessPayerAllocation(input, [line], [versionId, "31b0dc07-6209-44c1-bd56-ee5098ddc22e"]).issues.includes("scope_mismatch"));
});

test("statutory shares cannot silently discount private or mixed services", () => {
  const statutory = { ...input, payerModel: "statutory_share", patientShareBasisPoints: 2000, expectedPatientCents: 318 };
  assert.ok(assessPayerAllocation(statutory, [line], [versionId]).issues.includes("mixed_share_unsupported"));
  const bema = { ...line, schedule: "BEMA" as const };
  assert.equal(assessPayerAllocation(statutory, [bema], [versionId]).ok, true);
  assert.ok(assessPayerAllocation(input, [bema], [versionId]).issues.includes("bema_not_private_full"));
});
