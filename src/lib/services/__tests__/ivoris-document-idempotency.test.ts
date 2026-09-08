import test from "node:test";
import assert from "node:assert/strict";
import { findExistingDocumentId } from "@/lib/api/ivoris-doku-client";

test("finds an existing IVORIS document by stable name and date", () => {
  const result = findExistingDocumentId(
    { documents: [{ DocumentId: "doc-1", Name: "Anamnesebogen_Test_2026-09-08.pdf", Date: "2026-09-08T00:00:00" }] },
    { name: "Anamnesebogen_Test_2026-09-08.pdf", date: "2026-09-08" }
  );

  assert.equal(result, "doc-1");
});

test("does not reuse a document with a different name", () => {
  const result = findExistingDocumentId(
    [{ DocumentId: "doc-1", Name: "Anderer_Bogen.pdf", Date: "2026-09-08" }],
    { name: "Anamnesebogen_Test.pdf", date: "2026-09-08" }
  );

  assert.equal(result, null);
});
