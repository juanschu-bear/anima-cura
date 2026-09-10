import test from "node:test";
import assert from "node:assert/strict";
import { extractUnserZeichen } from "../matching-engine";

test("extractUnserZeichen keeps full suffix reference", () => {
  assert.deepEqual(extractUnserZeichen("00004105-2/2026-2"), {
    full: "00004105-2/2026-2",
    base: "00004105",
  });
});

test("extractUnserZeichen keeps suffix inside longer payment text", () => {
  assert.deepEqual(
    extractUnserZeichen("Gutschrift Überweisg. Anisimova, Iana Zeichen: 00004105-4/2023-1"),
    {
      full: "00004105-4/2023-1",
      base: "00004105",
    }
  );
});

test("extractUnserZeichen repairs spaces inside a bank-export year", () => {
  assert.deepEqual(extractUnserZeichen("Rechnung 00004398-3/202 3-1"), {
    full: "00004398-3/2023-1",
    base: "00004398",
  });
});

test("extractUnserZeichen accepts a dot as the bank-export separator", () => {
  assert.deepEqual(extractUnserZeichen("Zahlung 00003728-2.2023"), {
    full: "00003728-2/2023",
    base: "00003728",
  });
});

test("extractUnserZeichen normalizes leading zeroes in sequence and suffix", () => {
  assert.deepEqual(extractUnserZeichen("Zahlung 00004521-01/2024-01"), {
    full: "00004521-1/2024-1",
    base: "00004521",
  });
});
