import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeScribeAppointmentTypeName,
  scribeAppointmentTypeDisplayName,
} from "../../scribe-appointment-type";

test("shows the saved name of a custom appointment type after cloning a basis template", () => {
  const displayName = scribeAppointmentTypeDisplayName({
    termin_typ: "eigen-example",
    name: "Refinement",
    struktur: { praxis_muster: "Erstuntersuchung" },
  });

  assert.equal(displayName, "Refinement");
});

test("keeps the configured name for a standard appointment type", () => {
  const displayName = scribeAppointmentTypeDisplayName({
    termin_typ: "kontrolle",
    name: "Kontrolle",
    struktur: { praxis_muster: "MB-Kontrolle" },
  });

  assert.equal(displayName, "Kontrolle");
});

test("normalizes a custom appointment type name before saving", () => {
  assert.equal(normalizeScribeAppointmentTypeName("  Scan   für Refinement  "), "Scan für Refinement");
  assert.equal(normalizeScribeAppointmentTypeName("   "), null);
  assert.equal(normalizeScribeAppointmentTypeName("x".repeat(121)), null);
});
