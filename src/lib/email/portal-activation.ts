import { t } from "@/lib/i18n";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

/** No credentials, patient documents or private welcome tokens in reminder email. */
export function buildPortalActivationEmail(input: { firstName?: string; locale?: string; purpose?: "invitation"; accessLinks?: { name: string; submissionId: string }[] } = {}) {
  const locale = input.locale || "de";
  const prefix = input.purpose === "invitation" ? "invitation" : "activation";
  const subject = t(`${prefix}.subject`, locale);
  const greeting = input.firstName?.trim()
    ? t("activation.greeting", locale, { name: input.firstName.trim() })
    : t("activation.neutralGreeting", locale);
  const paragraphs = [greeting, ...["intro", "action", "invoices"].map(key => t(`${prefix}.${key}`, locale)), t("activation.help", locale), t("activation.signature", locale)];
  const url = "https://animacura.io/patient/login";
  const links = input.purpose === "invitation" && input.accessLinks?.length ? input.accessLinks.map(link => {
    if (!/^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|test-preview)$/i.test(link.submissionId)) throw new Error("Invalid personal access link");
    return { label: `${t("invitation.cta", locale)}${link.name ? ` – ${link.name}` : ""}`, url: `https://animacura.io/welcome/${link.submissionId}` };
  }) : [{ label: t("activation.cta", locale), url }];
  const text = [...paragraphs.slice(0, 3), ...links.map(link => `${link.label}: ${link.url}`), ...paragraphs.slice(3)].join("\n\n");
  const p = (value: string) => `<p style="margin:0 0 20px;color:#172b35;font:16px/1.6 Arial,sans-serif">${escapeHtml(value)}</p>`;
  if (input.purpose === "invitation") {
    const copy = (key: string) => t(`invitation.${key}`, locale);
    const buttons = links.map(link => `<p style="margin:22px 0"><a href="${escapeHtml(link.url)}" style="display:block;background:#225c4d;color:#ffffff;padding:18px 20px;font:bold 18px/1.4 Arial,sans-serif;text-align:center;text-decoration:none;border-radius:8px;overflow-wrap:anywhere">${escapeHtml(link.label)}</a></p>`).join("");
    const notice = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;background:#fff0c2;border:1px solid #ad7500;border-radius:12px"><tr><td style="padding:22px;color:#422e00"><h2 style="margin:0 0 12px;font:bold 24px/1.25 Arial,sans-serif;color:#422e00">${escapeHtml(copy("noticeTitle"))}</h2><p style="margin:0;font:16px/1.55 Arial,sans-serif;color:#422e00">${escapeHtml(copy("noticeBody"))}</p></td></tr></table>`;
    const invoiceReminder = `<h2 style="margin:28px 0 12px;font:bold 20px/1.35 Arial,sans-serif;color:#8a3417">${escapeHtml(copy("deadlineTitle"))}</h2>${p(copy("deadlineBody"))}`;
    const body = `${p(greeting)}${p(copy("shortIntro"))}${notice}${buttons}${p(copy("shortAccess"))}${p(copy("setup"))}${invoiceReminder}<p style="margin:24px 0;font:14px/1.5 Arial,sans-serif;color:#344b58">${escapeHtml(copy("alias"))}</p>${p(t("activation.help", locale))}${p(t("activation.signature", locale))}`;
    const invitationHtml = `<!doctype html><html lang="${locale === "en" ? "en" : "de"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eef2f4;color:#172b35"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff"><tr><td style="padding:24px"><p style="margin:0 0 28px;font:bold 16px Arial,sans-serif;color:#225c4d">KFO-Praxis Dr. Schubert</p><h1 style="margin:0 0 24px;font:bold 30px/1.2 Arial,sans-serif;color:#172b35">${escapeHtml(t("activation.title", locale))}</h1>${body}</td></tr></table></td></tr></table></body></html>`;
    return { subject, html: invitationHtml, text: [greeting, copy("shortIntro"), copy("noticeTitle"), copy("noticeBody"), ...links.map(link => `${link.label}: ${link.url}`), copy("shortAccess"), copy("setup"), copy("deadlineTitle"), copy("deadlineBody"), copy("alias"), t("activation.help", locale), t("activation.signature", locale)].join("\n\n") };
  }
  const html = `<!doctype html><html lang="${locale === "en" ? "en" : "de"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eef2f4;color:#172b35"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff"><tr><td style="padding:28px"><p style="color:#225c4d;font:bold 16px Arial,sans-serif">KFO-Praxis Dr. Schubert</p><h1 style="color:#172b35;font:bold 28px/1.2 Arial,sans-serif;margin:24px 0">${escapeHtml(t("activation.title", locale))}</h1>${paragraphs.slice(0, 3).map(p).join("")}<p style="margin:28px 0"><a href="${url}" style="display:inline-block;background:#225c4d;color:#ffffff;padding:14px 22px;font:bold 16px Arial,sans-serif;text-decoration:none;border-radius:6px">${escapeHtml(t("activation.cta", locale))}</a></p>${paragraphs.slice(3).map(p).join("")}<p style="font:14px/1.5 Arial,sans-serif;color:#344b58;word-break:break-all">${url}</p></td></tr></table></td></tr></table></body></html>`;
  const buttons = links.map(link => `<p style="margin:28px 0"><a href="${escapeHtml(link.url)}" style="display:inline-block;background:#225c4d;color:#ffffff;padding:14px 22px;font:bold 16px Arial,sans-serif;text-decoration:none;border-radius:6px">${escapeHtml(link.label)}</a></p>`).join("");
  const finalHtml = html.replace(/<p style="margin:28px 0">.*?<\/p>/, buttons);
  return { subject, text, html: finalHtml };
}
