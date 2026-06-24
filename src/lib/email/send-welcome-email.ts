/**
 * Send AnimaSign welcome email via Resend.
 * Requires env vars: RESEND_API_KEY, ANIMASIGN_EMAIL_FROM
 * Silent no-op if not configured.
 */
import { buildWelcomeEmail } from "./animasign-welcome";

type SendParams = {
  to: string;
  vorname: string;
  loginEmail: string;
  password: string;
  lang?: "de" | "en" | "es" | "ru" | "tr";
};

export async function sendWelcomeEmail(params: SendParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ANIMASIGN_EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[AnimaSign Email] RESEND_API_KEY oder ANIMASIGN_EMAIL_FROM fehlt, Email wird nicht gesendet.");
    return false;
  }

  const { subject, html } = buildWelcomeEmail({
    vorname: params.vorname,
    loginEmail: params.loginEmail,
    password: params.password,
    lang: params.lang,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: params.to,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[AnimaSign Email] Resend error:", res.status, err);
      return false;
    }

    console.log(`[AnimaSign Email] Willkommens-Email gesendet an ${params.to}`);
    return true;
  } catch (err) {
    console.error("[AnimaSign Email] Fehler:", err);
    return false;
  }
}
