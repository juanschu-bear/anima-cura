import test from "node:test";
import assert from "node:assert/strict";
import { summarizeInvoiceAccess } from "../invoice-access-tracking";

const P1 = "11111111-1111-4111-8111-111111111111", P2 = "22222222-2222-4222-8222-222222222222", P3 = "33333333-3333-4333-8333-333333333333";

test("reactions are merged per recipient from contact events, app events and the read app notice", () => {
  const [a, b, c] = summarizeInvoiceAccess({
    recipients: [
      { key: "a", email: " Anna@Example.de ", patientIds: [P1], appTitle: null },
      { key: "b", email: "ben@example.de", patientIds: [P2], appTitle: "Bens Rechnungen sind da" },
      { key: "c", email: "cara@example.de", patientIds: [P3], appTitle: "Caras Rechnungen sind da" },
    ],
    contactByEmail: new Map([["anna@example.de", "contact-a"]]),
    events: [
      { contactId: "contact-a", event: "page_opened", occurredAt: "2026-11-13T08:00:00Z" },
      { contactId: "contact-a", event: "page_opened", occurredAt: "2026-11-13T09:00:00Z" },
      { contactId: "contact-a", event: "access_created", occurredAt: "2026-11-13T09:05:00Z" },
      { contactId: "contact-a", event: "mail_sent", occurredAt: "2026-11-13T07:00:00Z" },
      { patientId: P2, event: "app_read", occurredAt: "2026-11-13T10:00:00Z" },
      { patientId: P3, event: "button_clicked", occurredAt: "2026-11-13T11:00:00Z" },
    ],
    notices: [
      { patientId: P2, titel: "Bens Rechnungen sind da", createdAt: "2026-11-13T01:10:00Z" },
      { patientId: P3, titel: "Neue Nachricht", createdAt: "2026-11-13T01:10:00Z" },
    ],
  });
  assert.deepEqual(a, { key: "a", pageOpenedAt: "2026-11-13T09:00:00Z", accessCreatedAt: "2026-11-13T09:05:00Z", appReadAt: null });
  assert.deepEqual(b, { key: "b", pageOpenedAt: null, accessCreatedAt: null, appReadAt: "2026-11-13T10:00:00Z" });
  // Ein anderer gelesener Hinweis zählt nicht als gelesene Rechnung.
  assert.deepEqual(c, { key: "c", pageOpenedAt: "2026-11-13T11:00:00Z", accessCreatedAt: null, appReadAt: null });
});

test("a read invoice notice alone counts as read in the app", () => {
  const [only] = summarizeInvoiceAccess({
    recipients: [{ key: "d", email: "d@example.de", patientIds: [P1, P2], appTitle: "Rechnungen sind da" }],
    contactByEmail: new Map(),
    events: [],
    notices: [{ patientId: P2, titel: "Rechnungen sind da", createdAt: "2026-11-13T01:20:00Z" }],
  });
  assert.equal(only.appReadAt, "2026-11-13T01:20:00Z");
});
