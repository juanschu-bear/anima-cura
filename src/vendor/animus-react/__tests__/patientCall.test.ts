import test from "node:test";
import assert from "node:assert/strict";

import { handlePatientCall } from "../patientCall";
import type { AnimusPatient, AnimusScene } from "../types";

function patient(id = "p-1", name = "Anna Becker"): AnimusPatient {
  return { id, name, gender: "w", age: 9, treatment: "Multiband" };
}

test("patient_call opens fallback card when no scene node matches", () => {
  const events: string[] = [];
  let card: AnimusPatient | null = null;
  let focused: AnimusPatient | null = null;
  const scene: AnimusScene = {
    setLevel: () => undefined,
    focusByName: () => false,
    unfocus: () => undefined,
    resize: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    dispose: () => undefined,
  };

  const matched = handlePatientCall({
    scene,
    patient: patient(),
    showCard: true,
    setCard: (next) => {
      card = next;
      events.push("card");
    },
    onPatientFocus: (next) => {
      focused = next;
      events.push("focus");
    },
    onPatientCall: () => events.push("call"),
    log: () => undefined,
  });

  assert.equal(matched, false);
  assert.ok(card);
  assert.ok(focused);
  const openedCard = card as AnimusPatient;
  const focusedPatient = focused as AnimusPatient;
  assert.equal(openedCard.id, "p-1");
  assert.equal(focusedPatient.id, "p-1");
  assert.deepEqual(events, ["card", "focus", "call"]);
});

test("patient_call skips fallback card when a scene node matches", () => {
  let card: AnimusPatient | null = null;
  let focused = false;
  const scene: AnimusScene = {
    setLevel: () => undefined,
    focusByName: () => true,
    unfocus: () => undefined,
    resize: () => undefined,
    start: () => undefined,
    stop: () => undefined,
    dispose: () => undefined,
  };

  const matched = handlePatientCall({
    scene,
    patient: patient(),
    showCard: true,
    setCard: (next) => {
      card = next;
    },
    onPatientFocus: () => {
      focused = true;
    },
    log: () => undefined,
  });

  assert.equal(matched, true);
  assert.equal(card, null);
  assert.equal(focused, false);
});
