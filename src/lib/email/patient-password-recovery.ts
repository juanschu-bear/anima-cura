import { t } from "@/lib/i18n";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

export function buildPatientPasswordRecoveryEmail(code: string, locale: "de" | "en" = "de", loginEmail?: string) {
  const subject = t("patientRecovery.emailSubject", locale);
  const title = t("patientRecovery.emailTitle", locale);
  const intro = t("patientRecovery.emailIntro", locale);
  const expiry = t("patientRecovery.emailExpiry", locale);
  const warning = t("patientRecovery.emailWarning", locale);
  const signature = t("patientRecovery.emailSignature", locale);
  const recoveryUrl = loginEmail
    ? `https://animacura.io/patient/login?recovery=1&step=verify&email=${encodeURIComponent(loginEmail)}`
    : "https://animacura.io/patient/login?recovery=1";
  const button = locale === "de" ? "Neues Passwort einrichten" : "Set a new password";
  const loginNote = loginEmail ? (locale === "de" ? `Deine Anmeldeadresse: ${loginEmail}` : `Your sign-in address: ${loginEmail}`) : "";
  const text = [title, intro, loginNote, code, expiry, `${button}: ${recoveryUrl}`, warning, signature].filter(Boolean).join("\n\n");
  const html = `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eef2f0;color:#18322b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:22px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #d8e1de;border-radius:18px;overflow:hidden"><tr><td style="padding:22px 28px;background:#173f34;color:#fff"><p style="margin:0;font:700 17px/1.4 Arial,sans-serif">Praxis Dr. Schubert</p><p style="margin:3px 0 0;color:#d8e8e2;font:14px/1.4 Arial,sans-serif">Anima Cura · Sicherer Patientenzugang</p></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 16px;color:#18322b;font:800 26px/1.2 Arial,sans-serif">${escapeHtml(title)}</h1><p style="margin:0 0 20px;color:#263f38;font:16px/1.6 Arial,sans-serif">${escapeHtml(intro)}</p>${loginNote ? `<p style="margin:0 0 16px;color:#425851;font:700 14px/1.55 Arial,sans-serif">${escapeHtml(loginNote)}</p>` : ""}<div style="margin:0 0 20px;padding:20px;background:#e8f3ef;border:1px solid #b8d7cc;border-radius:14px;color:#123e32;text-align:center;font:800 34px/1.2 Arial,sans-serif;letter-spacing:.22em">${escapeHtml(code)}</div><p style="margin:0 0 16px;color:#425851;font:15px/1.55 Arial,sans-serif">${escapeHtml(expiry)}</p><p style="margin:24px 0;text-align:center"><a href="${escapeHtml(recoveryUrl)}" style="display:inline-block;padding:15px 22px;border-radius:12px;background:#176b55;color:#fff;text-decoration:none;font:700 16px/1.2 Arial,sans-serif">${escapeHtml(button)}</a></p><p style="margin:0 0 22px;padding:14px 16px;background:#fff2ce;border-left:4px solid #d9a52c;color:#533900;font:700 14px/1.5 Arial,sans-serif">${escapeHtml(warning)}</p><p style="margin:0;color:#18322b;font:16px/1.6 Arial,sans-serif">${escapeHtml(signature)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}


export function buildPatientPortalActivationCodeEmail(code: string, locale: "de" | "en" = "de") {
  const subject = t("patientActivation.emailSubject", locale);
  const title = t("patientActivation.emailTitle", locale);
  const intro = t("patientActivation.emailIntro", locale);
  const expiry = t("patientRecovery.emailExpiry", locale);
  const warning = t("patientRecovery.emailWarning", locale);
  const signature = t("patientRecovery.emailSignature", locale);
  const text = [title, intro, code, expiry, warning, signature].join("\n\n");
  const html = `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eef2f0;color:#18322b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:22px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #d8e1de;border-radius:18px;overflow:hidden"><tr><td style="padding:22px 28px;background:#173f34;color:#fff"><p style="margin:0;font:700 17px/1.4 Arial,sans-serif">Praxis Dr. Schubert</p><p style="margin:3px 0 0;color:#d8e8e2;font:14px/1.4 Arial,sans-serif">Anima Cura · Sichere Aktivierung</p></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 16px;color:#18322b;font:800 26px/1.2 Arial,sans-serif">${escapeHtml(title)}</h1><p style="margin:0 0 20px;color:#263f38;font:16px/1.6 Arial,sans-serif">${escapeHtml(intro)}</p><div style="margin:0 0 20px;padding:20px;background:#e8f3ef;border:1px solid #b8d7cc;border-radius:14px;color:#123e32;text-align:center;font:800 34px/1.2 Arial,sans-serif;letter-spacing:.22em">${escapeHtml(code)}</div><p style="margin:0 0 16px;color:#425851;font:15px/1.55 Arial,sans-serif">${escapeHtml(expiry)}</p><p style="margin:0 0 22px;padding:14px 16px;background:#fff2ce;border:1px solid #edd792;border-radius:12px;color:#533900;font:700 14px/1.5 Arial,sans-serif">${escapeHtml(warning)}</p><p style="margin:0;color:#18322b;font:16px/1.6 Arial,sans-serif">${escapeHtml(signature)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
