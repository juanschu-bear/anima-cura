import test from "node:test";
import assert from "node:assert/strict";
import {
  findExistingDocumentId,
  findExistingEntryId,
  normalizeIvorisDocument,
  normalizeIvorisDocumentEntries,
} from "@/lib/api/ivoris-doku-client";

test("finds an existing Scribe entry by stable date, text and tooth", () => {
  const result = findExistingEntryId(
    { entries: [{ EntryId: "entry-42", Date: "2026-09-08T10:00:00", Text: "Kontrolle erfolgt. JS", Tooth: "21" }] },
    { date: "2026-09-08", text: "  Kontrolle   erfolgt. JS ", tooth: "21" }
  );
  assert.equal(result, "entry-42");
});

test("does not reuse a different Scribe text from the same day", () => {
  const result = findExistingEntryId(
    [{ EntryId: "entry-42", Date: "2026-09-08", Text: "Anderer Text" }],
    { date: "2026-09-08", text: "Kontrolle erfolgt. JS" }
  );
  assert.equal(result, null);
});

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

test("normalizes document entries returned by GetDocumentEntries", () => {
  const result = normalizeIvorisDocumentEntries([
    {
      Id: "entry-1",
      PatientId: "patient-1",
      ProfileId: "profile-1",
      Date: "2026-09-25T00:00:00Z",
      Type: "Text",
      Text: "Rechnung Q3 2026",
      DocumentId: "doc-77",
    },
  ]);

  assert.deepEqual(result, [
    {
      id: "entry-1",
      patientId: "patient-1",
      profileId: "profile-1",
      date: "2026-09-25T00:00:00Z",
      type: "Text",
      treatment: null,
      tooth: null,
      text: "Rechnung Q3 2026",
      documentId: "doc-77",
      raw: {
        Id: "entry-1",
        PatientId: "patient-1",
        ProfileId: "profile-1",
        Date: "2026-09-25T00:00:00Z",
        Type: "Text",
        Text: "Rechnung Q3 2026",
        DocumentId: "doc-77",
      },
    },
  ]);
});

test("normalizes a document returned by GetDocument", () => {
  const result = normalizeIvorisDocument({
    document: {
      Id: "doc-77",
      PatientId: "patient-1",
      ProfileId: "profile-1",
      Name: "Rechnung_Q3_2026.pdf",
      Date: "2026-09-25T00:00:00Z",
      Content: "JVBERi0x",
    },
  });

  assert.deepEqual(result, {
    id: "doc-77",
    patientId: "patient-1",
    profileId: "profile-1",
    name: "Rechnung_Q3_2026.pdf",
    date: "2026-09-25T00:00:00Z",
    contentBase64: "JVBERi0x",
    raw: {
      Id: "doc-77",
      PatientId: "patient-1",
      ProfileId: "profile-1",
      Name: "Rechnung_Q3_2026.pdf",
      Date: "2026-09-25T00:00:00Z",
      Content: "JVBERi0x",
    },
  });
});
