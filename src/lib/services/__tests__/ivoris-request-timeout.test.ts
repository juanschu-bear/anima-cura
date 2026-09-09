import test from "node:test";
import assert from "node:assert/strict";
import { parseIvorisRequestTimeoutMs } from "@/lib/api/ivoris-fetch";

test("uses a production-safe IVORIS request timeout", () => {
  assert.equal(parseIvorisRequestTimeoutMs(undefined), 20_000);
  assert.equal(parseIvorisRequestTimeoutMs("not-a-number"), 20_000);
  assert.equal(parseIvorisRequestTimeoutMs("50"), 1_000);
  assert.equal(parseIvorisRequestTimeoutMs("250000"), 120_000);
  assert.equal(parseIvorisRequestTimeoutMs("15000"), 15_000);
});

