import { buildWelcomeEmail } from "./animasign-welcome";

type SendParams = {
  to: string;
  vorname: string;
  lang?: "de" | "en" | "es" | "ru" | "tr";
  welcomeUrl: string;
};

export async function sendWelcomeEmail(params: SendParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ANIMASIGN_EMAIL_FROM;
  if (!apiKey || !from) {
    console.warn("[AnimaSign Email] RESEND nicht konfiguriert, Email wird nicht gesendet.");
    return false;
  }

  const { subject, html } = buildWelcomeEmail({
    vorname: params.vorname,
    lang: params.lang,
    welcomeUrl: params.welcomeUrl,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: params.to, subject, html }),
    });
    if (!res.ok) {
      console.error("[AnimaSign Email] Resend error:", res.status, await res.text());
      return false;
    }
    console.log(`[AnimaSign Email] Gesendet an ${params.to}`);
    return true;
  } catch (err) {
    console.error("[AnimaSign Email] Fehler:", err);
    return false;
  }
}
