import assert from "node:assert/strict";
import test from "node:test";

import { isBlockedPatientName } from "../patient-blocklist";

test("blocks the known IVORIS test patient in either name order", () => {
  assert.equal(isBlockedPatientName("zguiuok", "hijop"), true);
  assert.equal(isBlockedPatientName("hijop", "zguiuok"), true);
});

test("does not block ordinary patient names", () => {
  assert.equal(isBlockedPatientName("Emily Milena", "Berger"), false);
});
