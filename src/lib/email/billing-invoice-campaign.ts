import { createHash } from "node:crypto";
import { t } from "@/lib/i18n";

export type BillingEmailInvoice = {
  patientName: string;
  amountCents: number;
};

export type BillingInvoiceEmailInput = {
  activationRequired: boolean;
  dueDate: string;
  invoices: BillingEmailInvoice[];
  locale?: "de" | "en";
  test?: boolean;
};

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

function formatAmount(cents: number, locale: string) {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export function buildBillingInvoiceEmail(input: BillingInvoiceEmailInput) {
  if (!input.invoices.length) throw new Error("At least one invoice is required");
  const locale = input.locale ?? "de";
  const subject = t(input.activationRequired ? "billingEmail.activationSubject" : "billingEmail.invoiceSubject", locale);
  const title = t(input.activationRequired ? "billingEmail.activationTitle" : "billingEmail.invoiceTitle", locale);
  const attachment = t(input.invoices.length === 1 ? "billingEmail.attachmentSingular" : "billingEmail.attachmentPlural", locale);
  const policy = t(input.activationRequired ? "billingEmail.activationPolicy" : "billingEmail.invoicePolicy", locale);
  const cta = t(input.activationRequired ? "billingEmail.activationCta" : "billingEmail.invoiceCta", locale);
  const due = t("billingEmail.due", locale, { date: input.dueDate });
  const warning = t("billingEmail.deadlineWarning", locale);
  const help = t("billingEmail.help", locale);
  const signature = t("billingEmail.signature", locale);
  const invoiceLines = input.invoices.map(invoice => t("billingEmail.invoiceFor", locale, {
    name: invoice.patientName,
    amount: formatAmount(invoice.amountCents, locale),
  }));
  const url = "https://animacura.io/patient/login";
  const finalSubject = input.test ? `[TEST] ${subject}` : subject;
  const text = [
    t("billingEmail.greeting", locale),
    title,
    attachment,
    ...invoiceLines,
    due,
    policy,
    warning,
    `${cta}: ${url}`,
    help,
    signature,
  ].join("\n\n");
  const rows = input.invoices.map(invoice => `<tr><td style="padding:10px 0;border-bottom:1px solid #dce5e2;color:#18322b;font:600 15px/1.45 Arial,sans-serif">${escapeHtml(invoice.patientName)}</td><td align="right" style="padding:10px 0;border-bottom:1px solid #dce5e2;color:#18322b;font:700 15px/1.45 Arial,sans-serif;white-space:nowrap">${escapeHtml(formatAmount(invoice.amountCents, locale))}</td></tr>`).join("");
  const html = `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eef2f0;color:#18322b"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:22px 10px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #d8e1de;border-radius:18px;overflow:hidden"><tr><td style="padding:22px 28px;background:#173f34;color:#fff"><p style="margin:0;font:700 17px/1.4 Arial,sans-serif">Praxis Dr. Schubert</p><p style="margin:3px 0 0;color:#d8e8e2;font:14px/1.4 Arial,sans-serif">Kieferorthopädie · Leipzig</p></td></tr><tr><td style="padding:30px 28px"><p style="margin:0 0 12px;color:#a63c25;font:800 13px/1.3 Arial,sans-serif;letter-spacing:.08em">DRINGEND · HANDLUNG ERFORDERLICH</p><h1 style="margin:0 0 22px;color:#18322b;font:800 28px/1.18 Arial,sans-serif">${escapeHtml(title)}</h1><p style="margin:0 0 18px;color:#263f38;font:16px/1.6 Arial,sans-serif">${escapeHtml(attachment)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px">${rows}</table><div style="margin:0 0 22px;padding:17px 18px;background:#fff2ce;border:1px solid #d9a52c;border-radius:12px;color:#533900;font:800 18px/1.4 Arial,sans-serif">${escapeHtml(due)}</div><p style="margin:0 0 18px;color:#263f38;font:16px/1.6 Arial,sans-serif">${escapeHtml(policy)}</p><div style="margin:22px 0;padding:18px;background:#fff1ed;border-left:5px solid #b43c23;color:#582316;font:700 16px/1.55 Arial,sans-serif">${escapeHtml(warning)}</div><p style="margin:26px 0"><a href="${url}" style="display:block;padding:17px 20px;background:#12866f;border-radius:10px;color:#fff;text-align:center;text-decoration:none;font:800 16px/1.4 Arial,sans-serif">${escapeHtml(cta)}</a></p><p style="margin:0 0 20px;color:#425851;font:15px/1.55 Arial,sans-serif">${escapeHtml(help)}</p><p style="margin:0;color:#18322b;font:16px/1.6 Arial,sans-serif;white-space:pre-line">${escapeHtml(signature)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject: finalSubject, text, html };
}

export function billingInvoiceEmailVersion(dueDate: string) {
  const activation = buildBillingInvoiceEmail({
    activationRequired: true,
    dueDate,
    invoices: [{ patientName: "{{patient}}", amountCents: 1234 }],
  });
  const existing = buildBillingInvoiceEmail({
    activationRequired: false,
    dueDate,
    invoices: [{ patientName: "{{patient}}", amountCents: 1234 }],
  });
  return createHash("sha256")
    .update([activation.subject, activation.text, existing.subject, existing.text].join("\n"))
    .digest("hex");
}
