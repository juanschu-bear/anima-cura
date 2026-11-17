import assert from "node:assert/strict";
import test from "node:test";
import { resendCommunicationEvent } from "../resend-webhook";

test("maps Resend transport events to the communication ledger", () => {
  for (const [type, expected] of [
    ["email.sent", "accepted"],
    ["email.delivered", "delivered"],
    ["email.delivery_delayed", "delayed"],
    ["email.bounced", "bounced"],
    ["email.complained", "complained"],
    ["email.suppressed", "suppressed"],
    ["email.failed", "failed"],
    ["email.opened", "opened"],
    ["email.clicked", "clicked"],
  ] as const) {
    assert.equal(resendCommunicationEvent({
      type,
      created_at: "2026-11-17T09:00:00.000Z",
      data: { email_id: "provider-1" },
    })?.eventType, expected);
  }
});

test("keeps only operational failure details", () => {
  const event = resendCommunicationEvent({
    type: "email.bounced",
    created_at: "2026-11-17T09:00:00.000Z",
    data: {
      email_id: "provider-2",
      bounce: { type: "Permanent", subType: "General", message: "Mailbox unavailable" },
    },
  });
  assert.deepEqual(event, {
    eventType: "bounced",
    providerMessageId: "provider-2",
    occurredAt: "2026-11-17T09:00:00.000Z",
    metadata: {
      bounceType: "Permanent",
      bounceSubType: "General",
      message: "Mailbox unavailable",
    },
  });
});

test("ignores non-email events and events without provider id", () => {
  assert.equal(resendCommunicationEvent({
    type: "contact.created",
    created_at: "2026-11-17T09:00:00.000Z",
    data: { email_id: "provider-3" },
  }), null);
  assert.equal(resendCommunicationEvent({
    type: "email.delivered",
    created_at: "2026-11-17T09:00:00.000Z",
    data: {},
  }), null);
});
