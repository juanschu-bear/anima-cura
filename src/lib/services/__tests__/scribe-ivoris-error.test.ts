import test from "node:test";
import assert from "node:assert/strict";
import { buildScribeRetryFailurePatch, classifyScribeIvorisError } from "../scribe-ivoris-error";

test("retries every technical 5xx and network failure", () => {
  for (const error of [
    "IVORIS AddEntry fehlgeschlagen (500): leer",
    "IVORIS ist gerade nicht stabil erreichbar (503)",
    "fetch failed",
    "network timeout",
  ]) {
    assert.equal(classifyScribeIvorisError(error), "automatic_retry");
  }
});

test("retries historical configuration failures after configuration is restored", () => {
  assert.equal(
    classifyScribeIvorisError("IVORIS Doku-Konfiguration unvollstaendig. Erwartet: IVORIS_APP"),
    "automatic_retry"
  );
});

test("sends a rejected patient id to manual review", () => {
  assert.equal(
    classifyScribeIvorisError("IVORIS AddEntry fehlgeschlagen (400): The patient with Id abc could not be found."),
    "patient_manual_review"
  );
});

test("keeps technical failures retryable with capped backoff", () => {
  const first = buildScribeRetryFailurePatch("fetch failed", 0);
  const later = buildScribeRetryFailurePatch("fetch failed", 99);

  assert.equal(first.ivoris_retry_count, 1);
  assert.equal(first.ivoris_error_class, "automatic_retry");
  assert.ok(first.ivoris_next_retry_at);
  assert.equal(later.ivoris_retry_count, 100);
  assert.ok(later.ivoris_next_retry_at);
});
