import test from "node:test";
import assert from "node:assert/strict";
import {
  canPublishPracticeUpdates,
  canReadPracticeUpdates,
  isVisiblePracticeUpdate,
  localizePracticeUpdate,
  practiceUpdateCreateSchema,
} from "../../practice-updates";

const visibleUpdate = {
  status: "published",
  audience_roles: ["admin", "verwaltung", "lesezugriff"],
  visible_from: "2026-11-01T00:00:00.000Z",
  visible_until: "2026-12-01T00:00:00.000Z",
};

test("practice staff can read updates but only explicit developers can publish them", () => {
  for (const role of ["admin", "verwaltung", "lesezugriff"] as const) assert.equal(canReadPracticeUpdates(role), true);
  assert.equal(canReadPracticeUpdates("patient"), false);
  assert.equal(canPublishPracticeUpdates("admin"), false);
  assert.equal(canPublishPracticeUpdates("admin", true), true);
  assert.equal(canPublishPracticeUpdates("patient", true), false);
  assert.equal(canPublishPracticeUpdates("verwaltung"), false);
});

test("visibility respects publication, audience and time window", () => {
  const now = new Date("2026-11-04T12:00:00.000Z");
  assert.equal(isVisiblePracticeUpdate(visibleUpdate, "verwaltung", now), true);
  assert.equal(isVisiblePracticeUpdate({ ...visibleUpdate, status: "draft" }, "verwaltung", now), false);
  assert.equal(isVisiblePracticeUpdate({ ...visibleUpdate, audience_roles: ["admin"] }, "verwaltung", now), false);
  assert.equal(isVisiblePracticeUpdate({ ...visibleUpdate, visible_from: "2026-11-05T00:00:00.000Z" }, "verwaltung", now), false);
  assert.equal(isVisiblePracticeUpdate({ ...visibleUpdate, visible_until: "2026-11-04T11:00:00.000Z" }, "verwaltung", now), false);
});

test("update input requires bilingual content and a valid visibility window", () => {
  const input = {
    slug: "retainer-service",
    category: "neuerung",
    title: { de: "Retainer-Service", en: "Retainer service" },
    summary: { de: "Neue Auswahl", en: "New option" },
    body: { de: "Beschreibung", en: "Description" },
    visibleFrom: "2026-11-05T00:00:00+01:00",
    visibleUntil: "2026-11-04T00:00:00+01:00",
  };
  assert.equal(practiceUpdateCreateSchema.safeParse(input).success, false);
  assert.equal(practiceUpdateCreateSchema.safeParse({ ...input, visibleUntil: "2026-12-04T00:00:00+01:00" }).success, true);
});

test("localized update returns only the selected language", () => {
  const update = {
    title_de: "Titel", title_en: "Title",
    summary_de: "Kurz", summary_en: "Summary",
    body_de: "Text", body_en: "Body",
  };
  assert.deepEqual(localizePracticeUpdate(update, "de"), { title: "Titel", summary: "Kurz", body: "Text" });
  assert.deepEqual(localizePracticeUpdate(update, "en"), { title: "Title", summary: "Summary", body: "Body" });
});
