import test from "node:test";
import assert from "node:assert/strict";
import { decideIvorisDirectoryAction } from "../animasign-ivoris-directory";

test("reuses a unique narrower hit instead of creating a duplicate", () => {
  const decision = decideIvorisDirectoryAction([
    { label: "name+birthday", ids: ["a", "b", "c"] },
    { label: "email+birthday", ids: ["b"] },
    { label: "phone+birthday", ids: [] },
  ]);

  assert.equal(decision.kind, "reuse");
  assert.equal(decision.id, "b");
});

test("requires manual review when only ambiguous matches exist", () => {
  const decision = decideIvorisDirectoryAction([
    { label: "name+birthday", ids: ["a", "b"] },
    { label: "email+birthday", ids: ["a", "b"] },
    { label: "phone+birthday", ids: [] },
  ]);

  assert.equal(decision.kind, "manual_review");
});

test("allows create when every strategy returns zero hits", () => {
  const decision = decideIvorisDirectoryAction([
    { label: "name+birthday", ids: [] },
    { label: "email+birthday", ids: [] },
    { label: "phone+birthday", ids: [] },
  ]);

  assert.equal(decision.kind, "create");
});
