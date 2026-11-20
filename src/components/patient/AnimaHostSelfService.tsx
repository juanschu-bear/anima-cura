"use client";

/**
 * Selbstservice-Seiten zu AnimaHost (Vertrag: docs/2026-11-20-animahost-self-service-contract.md).
 *  - InvoiceRecipientConfirm: /patient/invoice-recipient/continue#code=…   POST /api/patient/invoice-recipient/confirm {code}
 *  - AttendanceVerify:        /patient/attendance-certificate/verify#code=… POST /api/patient/attendance-certificate/verify {code}
 *  - ContactChangeConfirm:    /patient/portal?contactChange=<id>            GET/POST /api/patient/contact-changes/<id>
 * Das Öffnen einer Seite ändert nichts. Erst der Klick sendet. Codes gehen nur im Body an den Server.
 */

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle, BadgeCheck, CheckCircle2, Loader2, MailCheck, ShieldCheck, XCircle } from "lucide-react";
import { t as translate } from "@/lib/i18n";
import { INVOICE_ACCESS_CSS } from "./InvoiceAccessContinue";
import { CERTIFICATE_CODE, RECIPIENT_CODE, codeFromHash, germanDate, proposedRows } from "@/lib/animahost-self-service";

type Locale = "de" | "en";
const localeNow = (): Locale => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "de");
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(body) });
async function json(r: Response): Promise<Record<string, unknown>> { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } }

const EXTRA_CSS = `
.ahs-rows{margin:0 0 20px;padding:14px 16px;border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(8,10,16,.5)}
.ahs-rows div{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:15px}
.ahs-rows dt{color:#aeb4bd}.ahs-rows dd{margin:0;font-weight:600;text-align:right;overflow-wrap:anywhere}
.ahs-big{margin:6px 0 4px;font:700 26px/1.2 'Fraunces',serif}
.ahs-bad{color:#fca5a5;margin:4px auto 12px}
.ahs-code{letter-spacing:.06em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;padding-left:16px}
.ahs-ghost{width:100%;min-height:48px;margin-top:10px;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:none;color:#d7dae0;font:600 15px 'DM Sans',sans-serif;cursor:pointer}
.ahs-ghost:hover{background:rgba(255,255,255,.06)}
.ahs-overlay{position:fixed;inset:0;z-index:200;overflow:auto;background:rgba(5,7,11,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.ahs-overlay .iac-root{background:none;min-height:100%}
`;

function Frame({ tag, children }: { tag: string; children: ReactNode }) {
  return (
    <div className="iac-root" style={{ color: "#fff" }}>
      <div className="iac-bg" aria-hidden="true"><div className="iac-glow iac-glow-1" /><div className="iac-glow iac-glow-2" /></div>
      <main className="iac-card">
        <div className="iac-sheen" aria-hidden="true" />
        <div className="iac-head"><p className="iac-brand">Anima Cura</p><p className="iac-tag">{tag}</p></div>
        <div className="iac-divider" aria-hidden="true" />
        {children}
      </main>
      <style dangerouslySetInnerHTML={{ __html: INVOICE_ACCESS_CSS + EXTRA_CSS }} />
    </div>
  );
}
const Busy = ({ label }: { label: string }) => <><Loader2 size={18} className="iac-spin" aria-hidden="true" />{label}</>;
const Problem = ({ text }: { text: string }) => <div className="iac-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{text}</span></div>;

/** Die neue Person bestätigt, dass künftige Rechnungen an sie gehen. */
export function InvoiceRecipientConfirm() {
  const [locale, setLocale] = useState<Locale>("de");
  const [code, setCode] = useState<string | null>(null);
  const [state, setState] = useState<"ready" | "sending" | "done" | "invalid" | "down">("ready");
  const t = (k: string, v?: Record<string, string | number>) => translate(k, locale, v);
  useEffect(() => { setLocale(localeNow()); setCode(codeFromHash(window.location.hash, RECIPIENT_CODE)); }, []);

  async function confirm() {
    if (!code || state === "sending") return;
    setState("sending");
    try {
      const r = await post("/api/patient/invoice-recipient/confirm", { code });
      const body = await json(r);
      setState(r.ok && body.confirmed === true ? "done" : r.ok ? "invalid" : "down");
    } catch { setState("down"); }
  }

  return (
    <Frame tag={t("selfService.recipient.tag")}>
      {code === null ? null : !code || state === "invalid" ? (
        <div className="iac-done"><XCircle size={44} className="ahs-bad" aria-hidden="true" />
          <h1 className="iac-title">{t("selfService.recipient.invalidTitle")}</h1><p className="iac-sub">{t("selfService.recipient.invalidText")}</p></div>
      ) : state === "done" ? (
        <div className="iac-done"><CheckCircle2 size={44} className="iac-done-icon" aria-hidden="true" />
          <h1 className="iac-title">{t("selfService.recipient.doneTitle")}</h1><p className="iac-sub">{t("selfService.recipient.doneText")}</p></div>
      ) : (
        <>
          <h1 className="iac-title">{t("selfService.recipient.title")}</h1>
          <p className="iac-sub">{t("selfService.recipient.intro")}</p>
          {state === "down" && <Problem text={t("selfService.unavailable")} />}
          <button type="button" className="iac-submit" onClick={confirm} disabled={state === "sending"}>
            {state === "sending" ? <Busy label={t("selfService.sending")} /> : <><MailCheck size={18} aria-hidden="true" />{t("selfService.recipient.button")}</>}
          </button>
          <p className="iac-foot"><ShieldCheck size={14} aria-hidden="true" />{t("selfService.recipient.foot")}</p>
        </>
      )}
    </Frame>
  );
}

/** Schule oder Arbeitgeber prüfen, ob eine Bescheinigung echt ist. Gezeigt werden nur Datum und Uhrzeit. */
export function AttendanceVerify() {
  const [locale, setLocale] = useState<Locale>("de");
  const [input, setInput] = useState("");
  const [state, setState] = useState<{ kind: "form" | "checking" | "invalid" | "down" } | { kind: "valid"; date: string; time: string }>({ kind: "form" });
  const t = (k: string, v?: Record<string, string | number>) => translate(k, locale, v);

  async function check(raw: string) {
    const code = raw.trim();
    if (!CERTIFICATE_CODE.test(code)) { setState({ kind: "invalid" }); return; }
    setState({ kind: "checking" });
    try {
      const r = await post("/api/patient/attendance-certificate/verify", { code });
      const body = await json(r);
      if (!r.ok) setState({ kind: "down" });
      else if (body.valid === true && typeof body.date === "string" && typeof body.time === "string") setState({ kind: "valid", date: body.date, time: body.time });
      else setState({ kind: "invalid" });
    } catch { setState({ kind: "down" }); }
  }
  useEffect(() => {
    setLocale(localeNow());
    const fromLink = codeFromHash(window.location.hash, CERTIFICATE_CODE);
    if (fromLink) { setInput(fromLink); void check(fromLink); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Frame tag={t("selfService.verify.tag")}>
      {state.kind === "valid" ? (
        <div className="iac-done"><BadgeCheck size={48} className="iac-done-icon" aria-hidden="true" />
          <h1 className="iac-title">{t("selfService.verify.validTitle")}</h1>
          <p className="ahs-big">{locale === "de" ? germanDate(state.date) : state.date}</p>
          <p className="iac-sub">{t("selfService.verify.validText", { time: state.time })}</p>
          <div className="iac-ok"><ShieldCheck size={16} aria-hidden="true" /><span>{t("selfService.verify.privacy")}</span></div>
          <button type="button" className="ahs-ghost" onClick={() => { setInput(""); setState({ kind: "form" }); }}>{t("selfService.verify.again")}</button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void check(input); }} noValidate>
          <h1 className="iac-title">{t("selfService.verify.title")}</h1>
          <p className="iac-sub">{t("selfService.verify.intro")}</p>
          {state.kind === "invalid" && <Problem text={t("selfService.verify.invalid")} />}
          {state.kind === "down" && <Problem text={t("selfService.verify.down")} />}
          <div className="iac-field">
            <label htmlFor="ahs-code" className="iac-label">{t("selfService.verify.label")}</label>
            <input id="ahs-code" className="iac-input ahs-code" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="text" maxLength={40} />
          </div>
          <button type="submit" className="iac-submit" disabled={state.kind === "checking"}>
            {state.kind === "checking" ? <Busy label={t("selfService.verify.checking")} /> : <><BadgeCheck size={18} aria-hidden="true" />{t("selfService.verify.button")}</>}
          </button>
        </form>
      )}
    </Frame>
  );
}

/** Im angemeldeten Portal: neue Kontaktdaten aus dem WhatsApp-Chat bestätigen. */
export function ContactChangeConfirm({ id }: { id: string }) {
  const [locale, setLocale] = useState<Locale>("de");
  const [open, setOpen] = useState(true);
  const [proposed, setProposed] = useState<unknown>(null);
  const [state, setState] = useState<"loading" | "ready" | "sending" | "done" | "gone" | "expired" | "conflict" | "down">("loading");
  const t = (k: string, v?: Record<string, string | number>) => translate(k, locale, v);
  const fromCode = (c: unknown) => (c === "contact_change_expired" ? "expired" : c === "contact_email_conflict" ? "conflict" : c === "contact_change_stale" || c === "contact_change_not_found" ? "gone" : "down");

  useEffect(() => {
    setLocale(localeNow());
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/patient/contact-changes/${id}`, { cache: "no-store" });
        const body = await json(r);
        if (!alive) return;
        if (r.ok && body.state === "applied") setState("done");
        else if (r.ok) { setProposed(body.proposed); setState("ready"); }
        else setState(fromCode(body.code));
      } catch { if (alive) setState("down"); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function confirm() {
    if (state !== "ready") return;
    setState("sending");
    try {
      const r = await post(`/api/patient/contact-changes/${id}`, {});
      const body = await json(r);
      setState(r.ok && body.state === "applied" ? "done" : fromCode(body.code));
    } catch { setState("down"); }
  }
  if (!open) return null;
  const close = <button type="button" className="ahs-ghost" onClick={() => setOpen(false)}>{t("selfService.contact.close")}</button>;
  const rows = proposedRows(proposed);

  return (
    <div className="ahs-overlay" role="dialog" aria-modal="true" aria-label={t("selfService.contact.title")}>
      <Frame tag={t("selfService.contact.tag")}>
        {state === "loading" ? <p className="iac-sub"><Loader2 size={16} className="iac-spin" aria-hidden="true" /> {t("selfService.sending")}</p>
          : state === "done" ? <div className="iac-done"><CheckCircle2 size={44} className="iac-done-icon" aria-hidden="true" /><h1 className="iac-title">{t("selfService.contact.doneTitle")}</h1><p className="iac-sub">{t("selfService.contact.doneText")}</p>{close}</div>
          : state === "ready" || state === "sending" ? (
            <>
              <h1 className="iac-title">{t("selfService.contact.title")}</h1>
              <p className="iac-sub">{t("selfService.contact.intro")}</p>
              <dl className="ahs-rows">{rows.map((row) => <div key={row.key}><dt>{t(row.label)}</dt><dd>{row.value}</dd></div>)}</dl>
              <button type="button" className="iac-submit" onClick={confirm} disabled={state === "sending"}>
                {state === "sending" ? <Busy label={t("selfService.sending")} /> : <><CheckCircle2 size={18} aria-hidden="true" />{t("selfService.contact.button")}</>}
              </button>
              <button type="button" className="ahs-ghost" onClick={() => setOpen(false)}>{t("selfService.contact.notMe")}</button>
            </>
          ) : (
            <div className="iac-done"><XCircle size={44} className="ahs-bad" aria-hidden="true" />
              <h1 className="iac-title">{t(`selfService.contact.${state}Title`)}</h1><p className="iac-sub">{t(`selfService.contact.${state}Text`)}</p>{close}</div>
          )}
      </Frame>
    </div>
  );
}
