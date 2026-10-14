import assert from "node:assert/strict";
import test from "node:test";
import { buildPatientPortalTarget, safePatientTarget } from "@/lib/patient-navigation";

const documentId = "b2a176e5-5506-4f3a-ba83-796db6206522";

test("preserves an invoice target through patient authentication", () => {
  const target = buildPatientPortalTarget({ document: documentId, section: "invoices" });
  assert.equal(target, `/patient/portal?document=${documentId}&section=invoices`);
  assert.equal(safePatientTarget(target), target);
});

test("keeps only supported patient portal parameters", () => {
  assert.equal(
    safePatientTarget(`/patient/portal?section=documents&unexpected=value`),
    "/patient/portal?section=documents",
  );
  assert.equal(safePatientTarget("/patient/portal?section=admin"), "/patient/portal");
});

test("rejects external and lookalike redirect targets", () => {
  assert.equal(safePatientTarget("https://example.com/patient/portal"), "/patient/portal");
  assert.equal(safePatientTarget("//example.com/patient/portal"), "/patient/portal");
  assert.equal(safePatientTarget("/patient/portal-malicious"), "/patient/portal");
});
