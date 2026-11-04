import test from "node:test";
import assert from "node:assert/strict";
import { makeScribeConfirmationAttempt, recordScribeConfirmationAttempt } from "../../scribe-confirmation-monitor";
import { consistencyResult } from "../../scribe-consistency";

test("monitor payload contains no text, patient or person reference", () => {
  const attempt = makeScribeConfirmationAttempt({
    patient_id: "patient-secret",
    patient_name: "Secret Name",
    text: "Clinical secret",
    behandlungsart: "multiband",
    termin_typ: "kontrolle",
  }, "rejected", consistencyResult([
    { code: "selected_text_missing", scope: "text", module: "kontrolle", group: "bogen_ok", optionIndex: 2 },
  ]));
  assert.deepEqual(attempt, {
    outcome: "rejected",
    template_key: "multiband|kontrolle",
    issues: [{ code: "selected_text_missing", module: "kontrolle", group: "bogen_ok" }],
  });
  const serialized = JSON.stringify(attempt);
  assert.doesNotMatch(serialized, /patient-secret|Secret Name|Clinical secret|optionIndex/);
});

test("confirmed attempt never persists stale issues", () => {
  const attempt = makeScribeConfirmationAttempt({ behandlungsart: "aligner", termin_typ: "kontrolle" }, "confirmed",
    consistencyResult([{ code: "input_invalid", scope: "input" }]));
  assert.deepEqual(attempt.issues, []);
});

test("monitor insert uses only the privacy-minimal payload", async () => {
  let written: unknown;
  const db = { from(table: string) {
    assert.equal(table, "scribe_confirmation_attempts");
    return { insert: async (value: unknown) => { written = value; return { error: null }; } };
  }};
  const attempt = makeScribeConfirmationAttempt({ behandlungsart: "multiband", termin_typ: "kontrolle" }, "confirmed");
  await recordScribeConfirmationAttempt(db as never, attempt);
  assert.deepEqual(written, attempt);
});

