import test from "node:test";
import assert from "node:assert/strict";
import { contactEmailMatches, likeLiteral, normalizeContactEmail } from "../invoice-contact-access";

test("contact email matches the Leitstand list rule: case and surrounding whitespace do not count", () => {
  const wanted = normalizeContactEmail(" Anna.Muster@Example.de ");
  assert.equal(wanted, "anna.muster@example.de");
  for (const stored of ["anna.muster@example.de", "Anna.Muster@Example.DE", " anna.muster@example.de", "anna.muster@example.de\t", "\u00a0anna.muster@example.de\u00a0"]) {
    assert.ok(contactEmailMatches(stored, wanted), JSON.stringify(stored));
  }
  for (const stored of ["xanna.muster@example.de", "anna.muster@example.de.vu", "anna.muster@example.de; b@c.de", null, ""]) {
    assert.equal(contactEmailMatches(stored, wanted), false, JSON.stringify(stored));
  }
});

test("LIKE wildcards in an address are taken literally", () => {
  assert.equal(likeLiteral("a_b%c\\d@x.de"), "a\\_b\\%c\\\\d@x.de");
});
