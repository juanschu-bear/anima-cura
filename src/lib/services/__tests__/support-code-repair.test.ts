import assert from "node:assert/strict";
import test from "node:test";
import { isMissingCodeComplaint } from "../support-code-repair";

function run(result: Record<string, unknown>) {
  return { id: "case-1", started_at: "2026-10-15T05:00:00Z", result };
}

test("detects explicit missing-code complaints", () => {
  assert.equal(isMissingCodeComplaint(run({ subject: "Kein Aktivierungscode erhalten" })), true);
  assert.equal(isMissingCodeComplaint(run({ subject: "Rechnung", excerpt: "Der Sicherheitscode kommt nicht an." })), true);
  assert.equal(isMissingCodeComplaint(run({ reason: "security_code_not_received" })), true);
});

test("never treats a generic login case as proof that a code is missing", () => {
  assert.equal(isMissingCodeComplaint(run({ category: "login_password", caseStatus: "open" })), false);
  assert.equal(isMissingCodeComplaint(run({ category: "login_password", caseStatus: "resolved" })), false);
  assert.equal(isMissingCodeComplaint(run({ reason: "security_code_not_received", caseStatus: "resolved" })), false);
  assert.equal(isMissingCodeComplaint(run({ category: "invoice_access", subject: "Wo ist meine Rechnung?" })), false);
});
