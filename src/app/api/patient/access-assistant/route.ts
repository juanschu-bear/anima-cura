import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  message: z.string().trim().min(1).max(800),
  locale: z.enum(["de", "en"]).default("de"),
});

const requestLog = new Map<string, number[]>();
const MAX_REQUESTS_PER_HOUR = 30;

function allowRequest(ip: string) {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  const recent = (requestLog.get(ip) || []).filter(value => value >= cutoff);
  if (recent.length >= MAX_REQUESTS_PER_HOUR) return false;
  recent.push(now);
  requestLog.set(ip, recent);
  return true;
}

function answer(message: string, locale: "de" | "en") {
  const value = message.toLocaleLowerCase(locale === "de" ? "de-DE" : "en-US");
  if (/passwort|password|anmelden|login|einlog|zugang|code/.test(value)) {
    return locale === "en"
      ? "Tap ‘Forgot password?’ below the password field. Enter your Anima Cura sign-in address, type the six-digit code from your contact email in the open app, and set your new password twice. You will then return to the invoice you originally opened."
      : "Tippe unter dem Passwortfeld auf „Passwort vergessen?“. Gib deine Anima-Cura-Anmeldeadresse ein, trage den sechsstelligen Code aus deiner Kontakt-E-Mail in der geöffneten App ein und vergib dein neues Passwort zweimal. Danach kommst du direkt zur zuvor geöffneten Rechnung zurück.";
  }
  if (/rechnung|invoice|dokument|document|öffnen|oeffnen/.test(value)) {
    return locale === "en"
      ? "Open the invoice button in the email and sign in. After sign-in, Anima Cura opens the matching invoice automatically. Future invoices are available in the patient portal under Documents."
      : "Öffne den Rechnungsbutton in der E-Mail und melde dich an. Nach der Anmeldung öffnet Anima Cura automatisch die passende Rechnung. Künftige Rechnungen findest du im Patientenportal unter „Dokumente“.";
  }
  if (/qr|überweis|ueberweis|bank|zahl|payment|rate/.test(value)) {
    return locale === "en"
      ? "The QR code on the invoice opens the protected patient portal. After sign-in, open the invoice or payment area and choose the banking QR code or a normal bank transfer. For questions about a specific amount, contact the practice team."
      : "Der QR-Code auf der Rechnung öffnet das geschützte Patientenportal. Öffne nach der Anmeldung die Rechnung oder den Zahlungsbereich und wähle dort Banking-QR oder normale Überweisung. Bei Fragen zu einem konkreten Betrag wende dich an das Praxisteam.";
  }
  if (/email|e-mail|adresse|mail/.test(value)) {
    return locale === "en"
      ? "Use the dedicated Anima Cura sign-in address shown in your access email. It may differ from your normal contact email. If you no longer have that message, email praxisteam@animacura.io."
      : "Nutze die eigene Anima-Cura-Anmeldeadresse aus deiner Zugangs-E-Mail. Sie kann von deiner normalen Kontakt-E-Mail abweichen. Wenn du diese Nachricht nicht mehr hast, schreibe an praxisteam@animacura.io.";
  }
  return locale === "en"
    ? "I can guide you through sign-in, password reset, invoices, and payments. For a medical question or a question about a specific amount, email praxisteam@animacura.io. Never send your password or security code."
    : "Ich helfe dir bei Anmeldung, Passwort, Rechnungen und Zahlung. Bei medizinischen Fragen oder einem konkreten Rechnungsbetrag schreibe an praxisteam@animacura.io. Sende niemals dein Passwort oder deinen Sicherheitscode.";
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  if (!allowRequest(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { text: answer(parsed.data.message, parsed.data.locale) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
