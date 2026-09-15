import assert from "node:assert/strict";
import test from "node:test";

import { addRecentPatient, parseRecentPatients, RECENT_PATIENTS_LIMIT } from "../../patient-recents";

const patient = (id: string, viewedAt = "2026-09-15T10:00:00.000Z") => ({
  id,
  vorname: `Vorname ${id}`,
  nachname: `Nachname ${id}`,
  geburtsdatum: "2010-01-01",
  viewedAt,
});

test("zuletzt aufgerufener Patient steht vorne und kommt nicht doppelt vor", () => {
  const result = addRecentPatient([patient("a"), patient("b")], patient("b", "2026-09-15T11:00:00.000Z"));
  assert.deepEqual(result.map((entry) => entry.id), ["b", "a"]);
  assert.equal(result[0].viewedAt, "2026-09-15T11:00:00.000Z");
});

test("Historie bleibt auf eine uebersichtliche Anzahl begrenzt", () => {
  const existing = Array.from({ length: RECENT_PATIENTS_LIMIT }, (_, index) => patient(String(index)));
  const result = addRecentPatient(existing, patient("neu"));
  assert.equal(result.length, RECENT_PATIENTS_LIMIT);
  assert.equal(result[0].id, "neu");
});

test("beschaedigte Browserdaten werden sicher verworfen", () => {
  assert.deepEqual(parseRecentPatients("kein json"), []);
  assert.deepEqual(parseRecentPatients(JSON.stringify([{ id: 123 }])), []);
});
