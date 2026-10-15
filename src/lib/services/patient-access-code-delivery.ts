import { PATIENT_EMAIL_FROM, PATIENT_EMAIL_REPLY_TO } from "@/lib/email/delivery";
import { buildPatientPasswordRecoveryEmail, buildPatientPortalActivationCodeEmail } from "@/lib/email/patient-password-recovery";
import { safeCreateCommunicationMessage, safeRecordCommunicationEvent } from "./communication-ledger";

type CodeRequest = { purpose: "activation" | "recovery"; patientId: string; to: string; code: string; requestId: string; loginEmail?: string };
type Dependencies = {
  apiKey: string | undefined;
  fetch: typeof fetch;
  create: typeof safeCreateCommunicationMessage;
  record: typeof safeRecordCommunicationEvent;
};

/** Record transport evidence, never the security code or rendered email body. */
export async function sendPatientAccessCode(input: CodeRequest, dependencies?: Dependencies) {
  const deps = dependencies ?? { apiKey: process.env.RESEND_API_KEY, fetch, create: safeCreateCommunicationMessage, record: safeRecordCommunicationEvent };
  const email = input.purpose === "activation" ? buildPatientPortalActivationCodeEmail(input.code) : buildPatientPasswordRecoveryEmail(input.code, "de", input.loginEmail);
  const message = await deps.create({
    patientId: input.patientId, campaignKey: `patient_access_code_${input.purpose}`, provider: "resend", recipient: input.to, subject: email.subject,
    metadata: { contentRestricted: true, securityPurpose: input.purpose, requestId: input.requestId },
  });
  try {
    if (!deps.apiKey) throw new Error("patient_code_mail_unavailable");
    const response = await deps.fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `patient-code-${input.purpose}-${input.requestId}` },
      body: JSON.stringify({ from: PATIENT_EMAIL_FROM, to: input.to, reply_to: PATIENT_EMAIL_REPLY_TO, subject: email.subject, html: email.html, text: email.text }),
    });
    if (!response.ok) throw new Error(`patient_code_mail_rejected:${response.status}`);
    const body = await response.json().catch(() => null) as { id?: unknown } | null;
    if (message) await deps.record({ messageId: message.id, eventType: "accepted", source: "transport", providerMessageId: typeof body?.id === "string" ? body.id : null });
  } catch (error) {
    if (message) await deps.record({ messageId: message.id, eventType: "failed", source: "transport", metadata: { reason: "code_delivery_failed" } });
    throw error;
  }
}
