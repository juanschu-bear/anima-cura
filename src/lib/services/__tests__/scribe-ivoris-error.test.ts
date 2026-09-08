import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScribeRetryFailurePatch,
  classifyScribeIvorisError,
  isIvorisServiceOutage,
} from "../scribe-ivoris-error";

test("retries every technical 5xx and network failure", () => {
  for (const error of [
    "IVORIS AddEntry fehlgeschlagen (500): leer",
    "IVORIS AddEntry fehlgeschlagen (502): Bad Gateway",
    "IVORIS ist gerade nicht stabil erreichbar (503)",
    "IVORIS AddEntry fehlgeschlagen (504): Gateway Timeout",
    "fetch failed",
    "network timeout",
    "read ECONNRESET",
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

test("opens the run-level circuit breaker only for service-wide failures", () => {
  for (const error of [
    "IVORIS AddDocument fehlgeschlagen (502): Bad Gateway",
    "IVORIS AddDocument fehlgeschlagen (503): null",
    "IVORIS AddDocument fehlgeschlagen (504): Gateway Timeout",
    "fetch failed",
    "read ECONNRESET",
  ]) {
    assert.equal(isIvorisServiceOutage(error), true);
  }
  assert.equal(isIvorisServiceOutage("Patient hat keine ivoris_id"), false);
  assert.equal(isIvorisServiceOutage("IVORIS AddEntry fehlgeschlagen (400): invalid"), false);
  assert.equal(isIvorisServiceOutage("IVORIS AddEntry fehlgeschlagen (500): internal"), false);
});
