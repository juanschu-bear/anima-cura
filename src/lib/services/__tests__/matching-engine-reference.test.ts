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
