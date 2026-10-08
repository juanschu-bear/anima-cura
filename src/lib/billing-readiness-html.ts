import { t } from "./i18n";
import type { loadScribeReadiness } from "./billing-readiness";

type Readiness = Awaited<ReturnType<typeof loadScribeReadiness>>;
export const escapeBillingHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

export function renderBillingReadiness(patient: { id: string; name: string }, result: Readiness, locale: "de" | "en") {
  const text = (key: string) => escapeBillingHtml(t(key, locale));
  const grouped = new Map<string, number>();
  for (const issue of result.issues) {
    const key = issue.code === "invalid_field" ? `invalid_${issue.field?.split(".")[0] ?? "field"}` : issue.code;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  const reasons = Array.from(grouped).map(([key, count]) => {
    const translation = t(`billing.issue.${key}`, locale);
    const label = translation === `billing.issue.${key}` ? t("billing.issue.invalid_field", locale) : translation;
    return `<li>${escapeBillingHtml(label)}${count > 1 ? ` <span>(${count})</span>` : ""}</li>`;
  }).join("");
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${text("billing.checkTitle")}</title>
<style>body{font:16px/1.6 Arial,sans-serif;margin:0;color:#172b3a;background:#f7f8fa}main{max-width:760px;margin:40px auto;padding:24px}h1{font-size:28px;line-height:1.2;margin:0 0 16px}h2{font-size:20px;margin-top:28px}p,li{overflow-wrap:anywhere}form{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}label{display:flex;flex-direction:column;gap:4px}input,button{font:inherit;padding:10px;border:1px solid #52616e;border-radius:6px}button{align-self:flex-end;background:#174c3c;color:white;cursor:pointer}a{color:#174c3c;text-underline-offset:3px}a:focus-visible,input:focus-visible,button:focus-visible{outline:3px solid #246ec7;outline-offset:3px}.notice{padding:16px;background:#fff4d6;color:#624200;border:1px solid #b99138;border-radius:8px}.meta{color:#465765}li{margin:8px 0}details{margin-top:24px}summary{cursor:pointer;font-weight:bold}@media(max-width:600px){main{margin:0;padding:20px}input{max-width:100%;box-sizing:border-box}}@media print{form,.back{display:none}body{background:white}main{margin:0}}</style></head><body><main>
<h1>${text("billing.checkTitle")}</h1><p>${escapeBillingHtml(patient.name)}</p>
<div class="notice"><strong>${text("billing.notIssued")}</strong><br>${text("billing.readOnlyNotice")}</div>
<form method="get"><input type="hidden" name="patient_id" value="${escapeBillingHtml(patient.id)}"><input type="hidden" name="lang" value="${locale}"><label>${text("billing.from")}<input type="date" name="from" required value="${escapeBillingHtml(result.period.from)}"></label><label>${text("billing.to")}<input type="date" name="to" required value="${escapeBillingHtml(result.period.to)}"></label><button type="submit">${text("billing.checkAgain")}</button></form>
<p class="meta">${text("billing.sourceScope")}</p>
<p>${text("billing.entries")}: <strong>${result.clinicalEntryCount}</strong> · ${text("billing.candidates")}: <strong>${result.lineCount}</strong></p>
<h2>${text("billing.missingTitle")}</h2><ul>${reasons}</ul>
<details><summary>${text("billing.coverageTitle")}</summary><p>${text("billing.coverageNotice")}</p><p>${text("billing.emptyEntries")}: ${result.entriesWithoutPositions}</p></details>
<p class="back"><a href="/rechnungen">${text("billing.backToDrafts")}</a></p>
</main></body></html>`;
}
