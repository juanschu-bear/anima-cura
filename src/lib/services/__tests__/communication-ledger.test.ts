import assert from "node:assert/strict";
import test from "node:test";
import { latestCommunicationTimestamp, nextCommunicationStatus } from "../communication-ledger";

test("communication status advances without regressing", () => {
  assert.equal(nextCommunicationStatus("queued", "accepted"), "accepted");
  assert.equal(nextCommunicationStatus("accepted", "delivered"), "delivered");
  assert.equal(nextCommunicationStatus("delivered", "opened"), "opened");
  assert.equal(nextCommunicationStatus("opened", "clicked"), "clicked");
  assert.equal(nextCommunicationStatus("clicked", "delivered"), "clicked");
});

test("portal evidence does not overwrite transport status", () => {
  assert.equal(nextCommunicationStatus("delivered", "document_opened"), "delivered");
  assert.equal(nextCommunicationStatus("accepted", "payment_opened"), "accepted");
});

test("delivery failures remain visible", () => {
  assert.equal(nextCommunicationStatus("accepted", "bounced"), "bounced");
  assert.equal(nextCommunicationStatus("bounced", "opened"), "bounced");
  assert.equal(nextCommunicationStatus("delivered", "complained"), "complained");
});

test("a delayed webhook retry cannot move last_event_at backwards", () => {
  assert.equal(
    latestCommunicationTimestamp("2026-11-17T22:08:00.000Z", "2026-11-17T22:07:00.000Z"),
    "2026-11-17T22:08:00.000Z",
  );
  assert.equal(
    latestCommunicationTimestamp("2026-11-17T22:08:00.000Z", "2026-11-17T22:09:00.000Z"),
    "2026-11-17T22:09:00.000Z",
  );
});
