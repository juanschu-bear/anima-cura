import test from "node:test";
import assert from "node:assert/strict";
import { isNonRetryableIvorisResponse } from "../animasign-sync-status";

test("sends deterministic IVORIS 4xx responses to manual review", () => {
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isNonRetryableIvorisResponse(`IVORIS write failed (${status}): rejected`), true);
  }
});

test("keeps transient and server failures retryable", () => {
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(isNonRetryableIvorisResponse(`IVORIS write failed (${status}): unavailable`), false);
  }
  assert.equal(isNonRetryableIvorisResponse("fetch failed"), false);
});

