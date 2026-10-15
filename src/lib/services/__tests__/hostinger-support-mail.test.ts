import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSupportReply,
  buildSupportEmailHtml,
  buildManualReviewAlert,
  classifySupportEvent,
  hostingerSupportRunId,
  parseHostingerSupportEvent,
  processHostingerSupportEvent,
  resolveSupportContactName,
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
  const invoice = event("Wo finde ich meine Rechnung?", "Der Rechnungslink zeigt zuerst die Anmeldung.");
  assert.equal(classifySupportEvent(invoice).category, "invoice_access");
  const login = event("Ich kann mich nicht anmelden", "Der Login funktioniert nicht.");
  assert.equal(classifySupportEvent(login).category, "login_password");
  assert.notEqual(
    buildSupportReply(invoice, classifySupportEvent(invoice)).text,
    buildSupportReply(login, classifySupportEvent(login)).text,
  );
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

test("escalates missing access codes even under an invoice subject", () => {
  for (const complaint of [
    "Beim Versuch, den Zugang einzurichten, ist kein Code angekommen.",
    "Kein Aktivierungscode erhalten.",
    "Keinen Zugangscode.",
    "Sicherheitscodes kommen nicht an.",
    "Ich bekomme keinen sechsstelligen Code und kann die Rechnung nicht öffnen.",
    "Der Sicherheitscode kommt nach mehreren Versuchen nicht an.",
    "Der Zugangscode fehlt weiterhin.",
  ]) {
    const incoming = event("Re: Deine Rechnung jetzt im Portal öffnen", complaint);
    assert.deepEqual(classifySupportEvent(incoming), {
      category: "login_password", autoReply: false, reason: "security_code_not_received",
    }, complaint);
    const alert = buildManualReviewAlert(incoming, classifySupportEvent(incoming));
    assert.match(alert.text, /Sicherheitscode nicht erhalten.*technische Prüfung der Codezustellung/);
    assert.match(alert.html, /technische Prüfung der Codezustellung/);
  }
});

test("holds missing or whitespace-only message text instead of answering the subject", () => {
  for (const excerpt of ["", " \n\t "]) {
    const incoming = event("Re: Deine Rechnung jetzt im Portal öffnen", excerpt);
    assert.deepEqual(classifySupportEvent(incoming), {
      category: "other", autoReply: false, reason: "missing_message_body",
    });
    const alert = buildManualReviewAlert(incoming, classifySupportEvent(incoming));
    assert.match(alert.text, /Nachrichtentext fehlt.*Originalnachricht persönlich prüfen/);
  }
  assert.equal(classifySupportEvent(event("Rechnung öffnen", "Wo finde ich das Dokument in der App?")).autoReply, true);
});

test("keeps medical, billing, and reply-loop protections ahead of code escalation", () => {
  const complaint = "Mein Sicherheitscode kommt nicht an.";
  assert.equal(classifySupportEvent(event("Schmerzen", complaint)).category, "medical");
  assert.equal(classifySupportEvent(event("Rechnungsbetrag", complaint)).category, "billing_specific");
  const automated = { ...event("Rechnung öffnen", complaint), senderEmail: "no-reply@example.com" };
  assert.equal(classifySupportEvent(automated).reason, "automated_or_loop_risk");
});

test("notifies only the internal review address for missing codes and missing bodies", async t => {
  const environment = {
    NEXT_PUBLIC_SUPABASE_URL: "https://support-fixture.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
    HOSTINGER_MAIL_API_TOKEN: "fixture-mail-token",
    HOSTINGER_MAILBOX_RESOURCE_ID: "fixture-mailbox",
    HOSTINGER_MAILBOX_ADDRESS: "praxisteam@animacura.io",
    SUPPORT_MANUAL_REVIEW_TO: "review@example.com",
  };
  const originalEnvironment = new Map(Object.keys(environment).map(key => [key, process.env[key]]));
  Object.assign(process.env, environment);
  t.after(() => {
    originalEnvironment.forEach((value, key) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  const sent: Array<{ to: string[]; text: string }> = [];
  const completed: Array<{ result: { manualReview: boolean; practiceNotified: boolean; reason: string } }> = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = JSON.parse(String(init?.body));
    if (url.hostname === "support-fixture.invalid" && url.pathname === "/rest/v1/workflow_runs") {
      if (init?.method === "PATCH") completed.push(body);
      return new Response(null, { status: 204 });
    }
    assert.equal(url.href, "https://api.mail.hostinger.com/api/v1/mailboxes/fixture-mailbox/send");
    sent.push(body);
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  });

  for (const text of ["Kein Aktivierungscode erhalten.", ""]) {
    const result = await processHostingerSupportEvent({
      event: "message.received",
      mailbox: "praxisteam@animacura.io",
      message: {
        from: { name: "Erika Beispiel", address: "erika@example.com" },
        subject: "Re: Deine Rechnung jetzt im Portal öffnen",
        text,
      },
    });
    assert.equal(result.ok, true);
    assert.ok("autoReplied" in result && result.autoReplied === false);
    assert.ok("practiceNotified" in result && result.practiceNotified === true);
  }
  assert.equal(sent.length, 2);
  for (const alert of sent) assert.deepEqual(alert.to, ["review@example.com"]);
  assert.match(sent[0].text, /technische Prüfung der Codezustellung/);
  assert.match(sent[1].text, /Originalnachricht persönlich prüfen/);
  assert.deepEqual(completed.map(row => row.result.reason), ["security_code_not_received", "missing_message_body"]);
  for (const row of completed) {
    assert.equal(row.result.manualReview, true);
    assert.equal(row.result.practiceNotified, true);
  }
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

test("personalizes only when the contact identity is unambiguous", () => {
  assert.equal(resolveSupportContactName("mutter@example.com", [], [{ nachname: "Meyer", answers: { vp_email: "mutter@example.com", vp_vorname: "Anna" } }], [], []), "Anna");
  assert.equal(resolveSupportContactName("familie@example.com", [], [], [], [{ nachname: "Meyer" }, { nachname: "Meyer" }]), "Familie Meyer");
  assert.equal(resolveSupportContactName("shared@example.com", [], [], [{ vorname: "Lena", email: "shared@example.com" }, { vorname: "Paul", email: "shared@example.com" }], []), null);
});

test("manual review alert contains the original context and direct patient reply", () => {
  const incoming = event("Schmerzen", "Mein Kind hat starke Zahnschmerzen.");
  const alert = buildManualReviewAlert(incoming, classifySupportEvent(incoming));
  assert.match(alert.subject, /Prüfung erforderlich/);
  assert.match(alert.text, /erika@example\.com/);
  assert.match(alert.html, /Patient direkt antworten/);
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
  assert.ok(retrieveSupportKnowledge("login_password", "Ich habe noch keinen Zugang").some(entry => entry.id === "access.self-activation"));
  assert.ok(retrieveSupportKnowledge("invoice_access", "Wo ist meine Rechnung?").some(entry => entry.id === "invoice.find-documents"));
  assert.ok(retrieveSupportKnowledge("payment_method", "Wie nutze ich den Banking-QR?").some(entry => entry.id === "payment.supported-methods"));
  assert.ok(retrieveSupportKnowledge("portal_setup", "App zum Home-Bildschirm hinzufügen").some(entry => entry.id === "portal.install"));
});

test("system prompt and output guard prohibit credential collection", () => {
  assert.match(SUPPORT_AGENT_SYSTEM_PROMPT, /ausschließlich mit Fakten/i);
  assert.equal(isSafeGeneratedSupportCore("Sende uns bitte dein Passwort per E-Mail."), false);
  assert.equal(isSafeGeneratedSupportCore("Öffne „Passwort vergessen?“ und vergib dort ein neues Passwort."), true);
});
