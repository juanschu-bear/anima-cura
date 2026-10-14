import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupportReply,
  buildSupportEmailHtml,
  classifySupportEvent,
  hostingerSupportRunId,
  parseHostingerSupportEvent,
} from "../hostinger-support-mail";
import { isSafeGeneratedSupportCore, SUPPORT_AGENT_SYSTEM_PROMPT } from "../hostinger-support-ai";
import { retrieveSupportKnowledge, SUPPORT_KNOWLEDGE_VERSION } from "@/lib/support/knowledge-base";

function event(subject: string, excerpt: string) {
  const parsed = parseHostingerSupportEvent({
    event: "message.received",
    mailbox: { address: "praxisteam@animacura.io", resource_id: "AC-test" },
    message: {
      uid: 42,
      path: "INBOX",
      from: { name: "Erika Beispiel", address: "erika@example.com" },
      subject,
      snippet: excerpt,
      date: "2026-10-13T12:00:00Z",
      messageId: "<fixture@example.com>",
    },
  });
  assert.ok(parsed);
  return parsed;
}

test("parses documented Hostinger webhook metadata and produces a stable claim", () => {
  const parsed = event("Anmeldung", "Mein Passwort funktioniert nicht.");
  assert.equal(parsed.senderEmail, "erika@example.com");
  assert.equal(parsed.mailboxResourceId, "AC-test");
  assert.equal(parsed.uid, 42);
  assert.equal(hostingerSupportRunId(parsed.eventKey), hostingerSupportRunId(parsed.eventKey));
});

test("auto-replies only to deterministic technical questions", () => {
  assert.deepEqual(classifySupportEvent(event("Passwort", "Ich kann mich nicht anmelden.")), {
    category: "login_password", autoReply: true, reason: "technical_access",
  });
  assert.equal(classifySupportEvent(event("Rechnung öffnen", "Wo finde ich das Dokument in der App?")).autoReply, true);
  assert.equal(classifySupportEvent(event("Zahlung", "Wie nutze ich den Banking-QR?")).autoReply, true);
  assert.equal(classifySupportEvent(event("App installieren", "Wie füge ich sie zum Home-Bildschirm hinzu?")).autoReply, true);
});

test("holds medical and case-specific billing messages for human review", () => {
  assert.deepEqual(classifySupportEvent(event("Schmerzen", "Mein Kind hat starke Zahnschmerzen.")), {
    category: "medical", autoReply: false, reason: "medical_question",
  });
  assert.deepEqual(classifySupportEvent(event("Rechnungsbetrag", "Warum soll ich 114,48 EUR zahlen?")), {
    category: "billing_specific", autoReply: false, reason: "case_specific_billing",
  });
  assert.equal(classifySupportEvent(event("Ratenplan", "Die Rate wurde schon bezahlt.")).autoReply, false);
});

test("prevents reply loops and never asks for passwords", () => {
  const parsed = parseHostingerSupportEvent({
    event: "message.received",
    mailbox: "praxisteam@animacura.io",
    message: { from: "no-reply@example.com", subject: "Automatic reply", preview: "Passwort" },
  });
  assert.ok(parsed);
  assert.equal(classifySupportEvent(parsed).autoReply, false);
  const technical = event("Passwort vergessen", "Ich komme nicht rein.");
  const reply = buildSupportReply(technical, classifySupportEvent(technical));
  assert.match(reply.text, /Passwort vergessen/);
  assert.match(reply.text, /niemals dein Passwort/);
  assert.doesNotMatch(reply.text, /sende.*Passwort per E-Mail/i);
});

test("renders branded responsive support email with a direct reply path", () => {
  const html = buildSupportEmailHtml("Hallo Erika,\n\nÖffne bitte dein Patientenportal.", "invoice_access");
  assert.match(html, /Anima Cura/);
  assert.match(html, /Rechnung sicher öffnen/);
  assert.match(html, /Zu meinen Rechnungen/);
  assert.match(html, /praxisteam@animacura\.io/);
  assert.match(html, /@media only screen and \(max-width:620px\)/);
  assert.doesNotMatch(html, /font-family:Arial,sans-serif/);
});

test("accepts common nested webhook field variants", () => {
  const parsed = parseHostingerSupportEvent({
    type: "message.received",
    data: {
      mailbox_resource_id: "AC-nested",
      mailbox: "praxisteam@animacura.io",
      email: { sender: "Max Muster <max@example.com>", subject: "Login", truncated_message: "Passwort geht nicht" },
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.senderEmail, "max@example.com");
  assert.equal(parsed.senderName, "Max Muster");
  assert.equal(parsed.mailboxResourceId, "AC-nested");
});

test("retrieves versioned knowledge for each automatic support category", () => {
  assert.match(SUPPORT_KNOWLEDGE_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  assert.ok(retrieveSupportKnowledge("login_password", "Passwort vergessen").some(entry => entry.id === "access.password-recovery"));
  assert.ok(retrieveSupportKnowledge("invoice_access", "Wo ist meine Rechnung?").some(entry => entry.id === "invoice.find-documents"));
  assert.ok(retrieveSupportKnowledge("payment_method", "Wie nutze ich den Banking-QR?").some(entry => entry.id === "payment.supported-methods"));
  assert.ok(retrieveSupportKnowledge("portal_setup", "App zum Home-Bildschirm hinzufügen").some(entry => entry.id === "portal.install"));
});

test("system prompt and output guard prohibit credential collection", () => {
  assert.match(SUPPORT_AGENT_SYSTEM_PROMPT, /ausschließlich mit Fakten/i);
  assert.equal(isSafeGeneratedSupportCore("Sende uns bitte dein Passwort per E-Mail."), false);
  assert.equal(isSafeGeneratedSupportCore("Öffne „Passwort vergessen?“ und vergib dort ein neues Passwort."), true);
});
