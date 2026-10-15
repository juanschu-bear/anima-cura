import assert from "node:assert/strict";
import test from "node:test";
import { nextCommunicationStatus } from "../communication-ledger";

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
