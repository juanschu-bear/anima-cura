import assert from "node:assert/strict";
import test from "node:test";
import { appendStaffInitials, normalizeStaffInitials } from "@/lib/scribe-identity";

test("normalisiert Mitarbeiterkürzel eindeutig", () => {
  assert.equal(normalizeStaffInitials(" sr "), "SR");
  assert.equal(normalizeStaffInitials("M.S."), "MS");
  assert.equal(normalizeStaffInitials(null), null);
});

test("hängt das interne Kürzel nicht an den IVORIS-Text", () => {
  assert.equal(appendStaffInitials("Kontrolle erfolgt. ", "sr"), "Kontrolle erfolgt.");
  assert.equal(appendStaffInitials("Kontrolle erfolgt.", null), "Kontrolle erfolgt.");
});
