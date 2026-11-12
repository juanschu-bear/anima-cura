import { t } from "@/lib/i18n";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

/**
 * Mail mit einem frischen persönlichen Zugangslink zu den Rechnungen (nach „Neuen Link schicken“).
 * Gleiche Bildsprache wie die übrigen Patientenmails von Anima Cura. Keine Beträge, keine Patientendaten.
 */
export function buildInvoiceAccessLinkEmail(url: string, locale: string = "de") {
  const l = locale === "en" || locale === "es" ? "en" : "de";
  if (!/^https:\/\/animacura\.io\/patient\/invoice-access\/continue\?/.test(url)) throw new Error("invoice_access_link_url_invalid");
  const subject = t("invoiceAccess.mailSubject", l);
  const title = t("invoiceAccess.mailTitle", l);
  const intro = t("invoiceAccess.mailIntro", l);
  const button = t("invoiceAccess.mailButton", l);
  const validity = t("invoiceAccess.mailValidity", l);
  const warning = t("invoiceAccess.mailWarning", l);
  const signature = t("patientRecovery.emailSignature", l);
  const text = [title, intro, `${button}: ${url}`, validity, warning, signature].join("\n\n");
  const html = `<!doctype html><html lang="${l}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eef2f0;color:#18322b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:22px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #d8e1de;border-radius:18px;overflow:hidden"><tr><td style="padding:22px 28px;background:#173f34;color:#fff"><p style="margin:0;font:700 17px/1.4 Arial,sans-serif">Praxis Dr. Schubert</p><p style="margin:3px 0 0;color:#d8e8e2;font:14px/1.4 Arial,sans-serif">Anima Cura · ${escapeHtml(t("invoiceAccess.tag", l))}</p></td></tr><tr><td style="padding:30px 28px"><h1 style="margin:0 0 16px;color:#18322b;font:800 26px/1.2 Arial,sans-serif">${escapeHtml(title)}</h1><p style="margin:0 0 24px;color:#263f38;font:16px/1.6 Arial,sans-serif">${escapeHtml(intro)}</p><p style="margin:0 0 24px;text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;padding:16px 26px;border-radius:12px;background:#176b55;color:#fff;text-decoration:none;font:700 17px/1.2 Arial,sans-serif">${escapeHtml(button)}</a></p><p style="margin:0 0 16px;color:#425851;font:15px/1.55 Arial,sans-serif">${escapeHtml(validity)}</p><p style="margin:0 0 22px;padding:14px 16px;background:#fff2ce;border:1px solid #edd792;border-radius:12px;color:#533900;font:700 14px/1.5 Arial,sans-serif">${escapeHtml(warning)}</p><p style="margin:0;color:#18322b;font:16px/1.6 Arial,sans-serif">${escapeHtml(signature)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
