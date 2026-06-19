import test from "node:test";
import assert from "node:assert/strict";

import { normalizeWakeWordInput, wakeWordMatchesTranscript } from "../wakeWord";

test("normalizeWakeWordInput normalizes umlauts and punctuation", () => {
  assert.equal(normalizeWakeWordInput("  Héy, Animus?! "), "hey animus");
});

test("wakeWordMatchesTranscript detects the phrase inside a longer sentence", () => {
  assert.equal(wakeWordMatchesTranscript("kannst du bitte, hey animus, den nächsten patienten aufrufen"), true);
});

test("wakeWordMatchesTranscript rejects unrelated speech", () => {
  assert.equal(wakeWordMatchesTranscript("ruf bitte anna becker auf"), false);
});

test("wakeWordMatchesTranscript accepts common speech-recognition variants", () => {
  assert.equal(wakeWordMatchesTranscript("okay animis bitte starte"), true);
  assert.equal(wakeWordMatchesTranscript("hallo animals verbinde dich"), true);
  assert.equal(wakeWordMatchesTranscript("hey anima"), true);
});
