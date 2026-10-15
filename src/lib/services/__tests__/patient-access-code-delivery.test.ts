import test from "node:test";
import assert from "node:assert/strict";
import { sendPatientAccessCode } from "../patient-access-code-delivery";

const request = {
  purpose: "activation" as const,
  patientId: "00000000-0000-4000-8000-000000000001",
  to: "patient@example.com",
  code: "654321",
  requestId: "00000000-0000-4000-8000-000000000002",
};

test("records accepted delivery evidence without storing the security code", async () => {
  let created: any;
  const events: any[] = [];
  let transportedBody = "";

  await sendPatientAccessCode(request, {
    apiKey: "test-key",
    fetch: async (_url, init) => {
      transportedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "provider-message-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    create: async input => {
      created = input;
      return { id: "ledger-message-1", trackingToken: "tracking-token" };
    },
    record: async input => { events.push(input); },
  });

  assert.match(transportedBody, /654321/, "the mail transport must receive the one-time code");
  assert.equal(created.patientId, request.patientId);
  assert.equal(created.recipient, request.to);
  assert.deepEqual(created.metadata, {
    contentRestricted: true,
    securityPurpose: "activation",
    requestId: request.requestId,
  });
  assert.doesNotMatch(JSON.stringify(created), /654321/);
  assert.deepEqual(events, [{
    messageId: "ledger-message-1",
    eventType: "accepted",
    source: "transport",
    providerMessageId: "provider-message-1",
  }]);
});

test("records a failed transport without leaking the security code", async () => {
  const events: any[] = [];

  await assert.rejects(sendPatientAccessCode(request, {
    apiKey: "test-key",
    fetch: async () => new Response("unavailable", { status: 503 }),
    create: async () => ({ id: "ledger-message-2", trackingToken: "tracking-token" }),
    record: async input => { events.push(input); },
  }), /patient_code_mail_rejected:503/);

  assert.deepEqual(events, [{
    messageId: "ledger-message-2",
    eventType: "failed",
    source: "transport",
    metadata: { reason: "code_delivery_failed" },
  }]);
  assert.doesNotMatch(JSON.stringify(events), /654321/);
});

test("recovery email opens the password step with the resolved login address", async () => {
  let transportedBody = "";
  await sendPatientAccessCode({ ...request, purpose: "recovery", loginEmail: "nora.eiselt2@animacura.de" }, {
    apiKey: "test-key",
    fetch: async (_url, init) => {
      transportedBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ id: "provider-message-3" }), { status: 200, headers: { "content-type": "application/json" } });
    },
    create: async () => ({ id: "ledger-message-3", trackingToken: "tracking-token" }),
    record: async () => undefined,
  });
  assert.match(transportedBody, /Neues Passwort einrichten/);
  assert.match(transportedBody, /step=verify/);
  assert.match(transportedBody, /nora.eiselt2%40animacura.de/);
});
