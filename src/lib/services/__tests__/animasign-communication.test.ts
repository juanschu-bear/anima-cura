import assert from "node:assert/strict";
import test from "node:test";
import { buildPortalActivationEmail } from "../../email/portal-activation";
import { activationDueAt, invoiceContactSchedule } from "../patient-communication-policy";

test("24-hour deadline uses first submission, not a later duplicate", () => {
  assert.equal(activationDueAt(["2026-09-28T09:00:00Z", "2026-09-28T19:00:00Z"]), Date.parse("2026-09-29T09:00:00Z"));
  assert.equal(activationDueAt([]), null);
  assert.equal(activationDueAt(["bad"]), null);
});
test("all three invoice stages are anchored to receipt", () => {
  assert.deepEqual(invoiceContactSchedule("2026-09-28T09:00:00Z"), [
    { days: 3, at: "2026-10-01T09:00:00.000Z" },
    { days: 14, at: "2026-10-12T09:00:00.000Z" },
    { days: 28, at: "2026-10-26T09:00:00.000Z" },
  ]);
  assert.equal(invoiceContactSchedule(null), null);
});
test("activation email escapes names and has readable HTML and plain text", () => {
  const email = buildPortalActivationEmail({ firstName: '<script>"Juan"</script>' });
  assert.ok(email.html.includes("&lt;script&gt;"));
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.text.includes("24 Stunden"));
  assert.ok(email.html.includes("color:#172b35"));
  assert.ok(!email.text.includes("Mahngebühren"));
  assert.ok(buildPortalActivationEmail({ locale: "en" }).text.includes("Sign in"));
});
