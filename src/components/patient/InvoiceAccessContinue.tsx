"use client";

/**
 * Persönlicher Zugang aus der Rechnungsmail (Juans Entscheidung, 12.11.2026): 1 Tipp aus der Mail,
 * Geburtsdatum des Kindes bestätigen, eigenes Passwort festlegen, direkt zu den Rechnungen.
 * Keine Patientennummer, keine zweite Code-Mail.
 *
 * Datenvertrag (Codex, 12.11.2026):
 *   GET  /patient/invoice-access/continue?token=…&next=…   diese Seite, verbraucht nichts
 *   POST /api/patient/invoice-access/track   { token }  Seite geöffnet (Tracking, ohne Wirkung auf den Link)
 *   POST /api/patient/invoice-access/confirm { token, birthDate, password }
 *        → { ok, loginEmail, redirect, children:[{ patientId, firstName, lastName }] }; danach meldet die Seite selbst an
 *   POST /api/patient/invoice-access/merge   { token, birthDate }  angemeldet; hängt die Kinder an einen bestehenden Zugang
 *   POST /api/patient/invoice-access/request { email, next? } → immer { ok: true }
 *   POST /api/patient/invoice-access/resend  { token } → immer { ok: true }, neuer Link an dieselbe Adresse
 *   Fehlercodes: access_link_invalid, access_link_expired, birth_date_mismatch, password_invalid, access_exists,
 *                access_merge_requires_same_email, invalid_request, rate_limited, not_authenticated, access_unavailable
 * Der Link enthält keine Mailadresse und keine Patientendaten. Eingaben bleiben bei jedem Fehler stehen.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Eye, EyeOff, Loader2, LockKeyhole, Mail, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { t as translate } from "@/lib/i18n";
import { createBrowserClient } from "@/lib/db/supabase";
import { safePatientTarget } from "@/lib/patient-navigation";

type Fehler = "" | "birth_date_mismatch" | "password_invalid" | "password_mismatch" | "password_length" | "birth_date_missing" | "rate_limited" | "access_unavailable";
type Zustand =
  | { art: "formular" }
  | { art: "fertig"; ziel: string; kinder: string[]; angemeldet: boolean }
  | { art: "vorhanden" }
  | { art: "link"; grund: "access_link_invalid" | "access_link_expired" | "kein_token" };
type Nachschub = "bereit" | "sendet" | "unterwegs" | "adresse" | "adresse_sendet" | "adresse_unterwegs";

const MINDESTLAENGE = 8; // dieselbe Regel wie bei „Passwort vergessen“ und „Zugang herstellen“

async function jsonVon(r: Response): Promise<Record<string, unknown>> {
  try { return (await r.json()) as Record<string, unknown>; } catch { return {}; }
}

function codeVon(body: Record<string, unknown>): string {
  const c = body.code ?? body.error;
  return typeof c === "string" ? c : "";
}

export default function InvoiceAccessContinue() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const ziel = safePatientTarget(params.get("next") || "/patient/portal?section=rechnungen");
  const locale = params.get("lang") === "en" ? "en" : "de";
  const t = (key: string, vars?: Record<string, string | number>) => translate(key, locale, vars);

  const [zustand, setZustand] = useState<Zustand>(token ? { art: "formular" } : { art: "link", grund: "kein_token" });
  const [geburtsdatum, setGeburtsdatum] = useState("");
  const [passwort, setPasswort] = useState("");
  const [wiederholung, setWiederholung] = useState("");
  const [zeigen, setZeigen] = useState(false);
  const [fehler, setFehler] = useState<Fehler>("");
  const [sendet, setSendet] = useState(false);
  const [nachschub, setNachschub] = useState<Nachschub>(token ? "bereit" : "adresse");
  const [adresse, setAdresse] = useState("");
  const [altesPasswort, setAltesPasswort] = useState("");
  const [anmeldeFehler, setAnmeldeFehler] = useState<"" | "falsch" | "andere_adresse" | "unavailable">("");
  const [meldetAn, setMeldetAn] = useState(false);
  const heute = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Tracking „Seite geöffnet“: ein ausdrücklicher Aufruf der Seite, das Öffnen allein verbraucht den Link nicht.
  useEffect(() => {
    if (!token) return;
    void fetch("/api/patient/invoice-access/track", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify({ token }) }).catch(() => undefined);
  }, [token]);

  // Nach dem Einrichten kurz zeigen, wer im Zugang ist, dann weiter zu den Rechnungen.
  useEffect(() => {
    if (zustand.art !== "fertig" || !zustand.angemeldet) return;
    const id = window.setTimeout(() => router.replace(zustand.ziel), 2600);
    return () => window.clearTimeout(id);
  }, [zustand, router]);

  async function absenden(e: React.FormEvent) {
    e.preventDefault();
    if (sendet) return;
    if (!geburtsdatum) return setFehler("birth_date_missing");
    if (passwort.length < MINDESTLAENGE) return setFehler("password_length");
    if (passwort !== wiederholung) return setFehler("password_mismatch");
    setFehler("");
    setSendet(true);
    try {
      const r = await fetch("/api/patient/invoice-access/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token, birthDate: geburtsdatum, password: passwort }),
      });
      const body = await jsonVon(r);
      if (r.ok && body.ok) {
        const kinder = Array.isArray(body.children)
          ? (body.children as { firstName?: unknown }[]).map((k) => (typeof k.firstName === "string" ? k.firstName : "")).filter(Boolean)
          : [];
        const weiter = typeof body.redirect === "string" ? safePatientTarget(body.redirect) : ziel;
        // Der Zugang steht. Jetzt mit der Mailadresse und dem neuen Passwort anmelden, damit es direkt weitergeht.
        let angemeldet = false;
        if (typeof body.loginEmail === "string") {
          try {
            const signIn = await createBrowserClient().auth.signInWithPassword({ email: body.loginEmail, password: passwort });
            angemeldet = !signIn.error;
          } catch { angemeldet = false; }
        }
        setZustand({ art: "fertig", ziel: angemeldet ? weiter : `/patient/login?next=${encodeURIComponent(weiter)}`, kinder, angemeldet });
        return;
      }
      const code = codeVon(body);
      if (code === "access_exists") {
        setZustand({ art: "vorhanden" });
      } else if (code === "access_link_invalid" || code === "access_link_expired") {
        setZustand({ art: "link", grund: code });
      } else if (code === "invalid_request" && token.length < 20) {
        setZustand({ art: "link", grund: "access_link_invalid" });
      } else if (code === "birth_date_mismatch" || code === "password_invalid" || code === "rate_limited") {
        setFehler(code);
      } else {
        setFehler("access_unavailable");
      }
    } catch {
      setFehler("access_unavailable");
    } finally {
      setSendet(false);
    }
  }

  // Es gibt schon einen Zugang für diese Adresse: anmelden, dann hängen sich weitere Kinder an (ausdrückliche Zusammenführung).
  async function anmeldenUndZusammenfuehren(e: React.FormEvent) {
    e.preventDefault();
    if (meldetAn || !adresse.trim() || !altesPasswort) return;
    setMeldetAn(true);
    setAnmeldeFehler("");
    try {
      const signIn = await createBrowserClient().auth.signInWithPassword({ email: adresse.trim(), password: altesPasswort });
      if (signIn.error) { setAnmeldeFehler("falsch"); return; }
      const r = await fetch("/api/patient/invoice-access/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token, birthDate: geburtsdatum }),
      });
      const body = await jsonVon(r);
      if (r.ok && body.ok) {
        const kinder = Array.isArray(body.children)
          ? (body.children as { firstName?: unknown }[]).map((k) => (typeof k.firstName === "string" ? k.firstName : "")).filter(Boolean)
          : [];
        setZustand({ art: "fertig", ziel: typeof body.redirect === "string" ? safePatientTarget(body.redirect) : ziel, kinder, angemeldet: true });
        return;
      }
      const code = codeVon(body);
      if (code === "access_merge_requires_same_email") { setAnmeldeFehler("andere_adresse"); return; }
      // Link schon verbraucht oder abgelaufen: angemeldet ist man trotzdem, also direkt zu den Rechnungen.
      setZustand({ art: "fertig", ziel, kinder: [], angemeldet: true });
    } catch {
      setAnmeldeFehler("unavailable");
    } finally {
      setMeldetAn(false);
    }
  }

  async function neuerLinkPerToken() {
    setNachschub("sendet");
    try {
      const r = await fetch("/api/patient/invoice-access/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token }),
      });
      // Gibt es den Weg über den alten Link nicht, reicht die Mailadresse.
      setNachschub(r.ok ? "unterwegs" : "adresse");
    } catch {
      setNachschub("adresse");
    }
  }

  async function neuerLinkPerAdresse(e: React.FormEvent) {
    e.preventDefault();
    if (!adresse.trim()) return;
    setNachschub("adresse_sendet");
    try {
      await fetch("/api/patient/invoice-access/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ email: adresse.trim(), next: ziel }),
      });
    } catch {
      /* Die Antwort verrät absichtlich nichts; der Hinweis bleibt derselbe. */
    }
    setNachschub("adresse_unterwegs");
  }

  const fehlerText: Record<Exclude<Fehler, "">, string> = {
    birth_date_missing: t("invoiceAccess.birthDateMissing"),
    birth_date_mismatch: t("invoiceAccess.birthDateMismatch"),
    password_length: t("patientRecovery.passwordLength"),
    password_invalid: t("patientRecovery.passwordLength"),
    password_mismatch: t("patientRecovery.passwordMismatch"),
    rate_limited: t("invoiceAccess.rateLimited"),
    access_unavailable: t("invoiceAccess.unavailable"),
  };
  const amDatum = fehler === "birth_date_missing" || fehler === "birth_date_mismatch";
  const amPasswort = fehler === "password_length" || fehler === "password_invalid";
  const anWiederholung = fehler === "password_mismatch";
  const allgemein = fehler === "rate_limited" || fehler === "access_unavailable";

  return (
    <div className="iac-root">
      <div className="iac-bg" aria-hidden="true"><div className="iac-glow iac-glow-1" /><div className="iac-glow iac-glow-2" /></div>
      <main className="iac-card">
        <div className="iac-sheen" aria-hidden="true" />
        <div className="iac-head">
          <p className="iac-brand">Anima Cura</p>
          <p className="iac-tag">{t("invoiceAccess.tag")}</p>
        </div>
        <div className="iac-divider" aria-hidden="true" />

        {zustand.art === "formular" && (
          <form onSubmit={absenden} noValidate>
            <p className="iac-step">{t("invoiceAccess.step")}</p>
            <h1 className="iac-title">{t("invoiceAccess.title")}</h1>
            <p className="iac-sub">{t("invoiceAccess.intro")}</p>

            {allgemein && (
              <div className="iac-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{fehlerText[fehler as Exclude<Fehler, "">]}</span></div>
            )}

            <div className="iac-field">
              <label htmlFor="iac-birth" className="iac-label">{t("invoiceAccess.birthDate")}</label>
              <div className="iac-wrap">
                <CalendarDays size={18} className="iac-icon" aria-hidden="true" />
                <input id="iac-birth" type="date" autoComplete="off" required min="1900-01-01" max={heute} value={geburtsdatum}
                  onChange={(e) => { setGeburtsdatum(e.target.value); if (amDatum) setFehler(""); }}
                  aria-invalid={amDatum} aria-describedby="iac-birth-help" className={`iac-input iac-date${amDatum ? " is-wrong" : ""}`} />
              </div>
              <p id="iac-birth-help" className={amDatum ? "iac-help is-wrong" : "iac-help"} role={amDatum ? "alert" : undefined}>
                {amDatum ? fehlerText[fehler as Exclude<Fehler, "">] : t("invoiceAccess.birthDateHelp")}
              </p>
            </div>

            <div className="iac-field">
              <label htmlFor="iac-pw" className="iac-label">{t("invoiceAccess.password")}</label>
              <div className="iac-wrap">
                <LockKeyhole size={18} className="iac-icon" aria-hidden="true" />
                <input id="iac-pw" type={zeigen ? "text" : "password"} autoComplete="new-password" required minLength={MINDESTLAENGE} value={passwort}
                  onChange={(e) => { setPasswort(e.target.value); if (amPasswort) setFehler(""); }}
                  aria-invalid={amPasswort} aria-describedby="iac-pw-help" className={`iac-input iac-input-pw${amPasswort ? " is-wrong" : ""}`} />
                <button type="button" className="iac-toggle" onClick={() => setZeigen((v) => !v)} aria-label={zeigen ? t("invoiceAccess.hidePassword") : t("invoiceAccess.showPassword")} aria-pressed={zeigen}>
                  {zeigen ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
              <p id="iac-pw-help" className={amPasswort ? "iac-help is-wrong" : "iac-help"} role={amPasswort ? "alert" : undefined}>
                {amPasswort ? fehlerText[fehler as Exclude<Fehler, "">] : t("invoiceAccess.passwordHelp", { n: MINDESTLAENGE })}
              </p>
            </div>

            <div className="iac-field">
              <label htmlFor="iac-pw2" className="iac-label">{t("invoiceAccess.passwordRepeat")}</label>
              <div className="iac-wrap">
                <LockKeyhole size={18} className="iac-icon" aria-hidden="true" />
                <input id="iac-pw2" type={zeigen ? "text" : "password"} autoComplete="new-password" required value={wiederholung}
                  onChange={(e) => { setWiederholung(e.target.value); if (anWiederholung) setFehler(""); }}
                  aria-invalid={anWiederholung} className={`iac-input${anWiederholung ? " is-wrong" : ""}`} />
              </div>
              {anWiederholung && <p className="iac-help is-wrong" role="alert">{fehlerText.password_mismatch}</p>}
            </div>

            <button type="submit" className="iac-submit" disabled={sendet}>
              {sendet ? <><Loader2 size={18} className="iac-spin" aria-hidden="true" />{t("invoiceAccess.submitting")}</> : t("invoiceAccess.submit")}
            </button>
            <p className="iac-foot"><ShieldCheck size={14} aria-hidden="true" />{t("invoiceAccess.foot")}</p>
          </form>
        )}

        {zustand.art === "fertig" && (
          <div className="iac-done" role="status" aria-live="polite">
            <CheckCircle2 size={44} className="iac-done-icon" aria-hidden="true" />
            <h1 className="iac-title">{t("invoiceAccess.doneTitle")}</h1>
            <p className="iac-sub">
              {!zustand.angemeldet
                ? t("invoiceAccess.doneSignIn")
                : zustand.kinder.length > 1
                  ? t("invoiceAccess.doneChildren", { names: zustand.kinder.join(", ") })
                  : t("invoiceAccess.doneText")}
            </p>
            <button type="button" className="iac-submit" onClick={() => router.replace(zustand.ziel)}>{zustand.angemeldet ? t("invoiceAccess.toInvoices") : t("invoiceAccess.toSignIn")}</button>
          </div>
        )}

        {zustand.art === "vorhanden" && (
          <form onSubmit={anmeldenUndZusammenfuehren} noValidate>
            <h1 className="iac-title">{t("invoiceAccess.existsTitle")}</h1>
            <p className="iac-sub">{t("invoiceAccess.existsText")}</p>
            {anmeldeFehler && (
              <div className="iac-error" role="alert"><AlertCircle size={16} aria-hidden="true" /><span>{anmeldeFehler === "falsch" ? t("invoiceAccess.signInFailed") : anmeldeFehler === "andere_adresse" ? t("invoiceAccess.mergeOtherEmail") : t("invoiceAccess.unavailable")}</span></div>
            )}
            <div className="iac-field">
              <label htmlFor="iac-login-mail" className="iac-label">{t("invoiceAccess.email")}</label>
              <div className="iac-wrap">
                <Mail size={18} className="iac-icon" aria-hidden="true" />
                <input id="iac-login-mail" type="email" inputMode="email" autoComplete="username" required value={adresse} onChange={(e) => setAdresse(e.target.value)} className="iac-input" />
              </div>
              <p className="iac-help">{t("invoiceAccess.emailHelp")}</p>
            </div>
            <div className="iac-field">
              <label htmlFor="iac-login-pw" className="iac-label">{t("invoiceAccess.existingPassword")}</label>
              <div className="iac-wrap">
                <LockKeyhole size={18} className="iac-icon" aria-hidden="true" />
                <input id="iac-login-pw" type={zeigen ? "text" : "password"} autoComplete="current-password" required value={altesPasswort} onChange={(e) => setAltesPasswort(e.target.value)} className="iac-input iac-input-pw" />
                <button type="button" className="iac-toggle" onClick={() => setZeigen((v) => !v)} aria-label={zeigen ? t("invoiceAccess.hidePassword") : t("invoiceAccess.showPassword")} aria-pressed={zeigen}>
                  {zeigen ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>
            <button type="submit" className="iac-submit" disabled={meldetAn || !adresse.trim() || !altesPasswort}>
              {meldetAn ? <><Loader2 size={18} className="iac-spin" aria-hidden="true" />{t("invoiceAccess.signingIn")}</> : t("invoiceAccess.existsSubmit")}
            </button>
            <a className="iac-login" href={`/patient/login?next=${encodeURIComponent(ziel)}`}>{t("invoiceAccess.forgotPassword")}</a>
          </form>
        )}

        {zustand.art === "link" && (
          <div>
            <h1 className="iac-title">
              {zustand.grund === "access_link_expired" ? t("invoiceAccess.linkExpiredTitle") : zustand.grund === "kein_token" ? t("invoiceAccess.noLinkTitle") : t("invoiceAccess.linkInvalidTitle")}
            </h1>
            <p className="iac-sub">{zustand.grund === "kein_token" ? t("invoiceAccess.noLinkText") : t("invoiceAccess.linkText")}</p>

            {(nachschub === "bereit" || nachschub === "sendet") && (
              <button type="button" className="iac-submit" onClick={() => void neuerLinkPerToken()} disabled={nachschub === "sendet"}>
                {nachschub === "sendet" ? <><Loader2 size={18} className="iac-spin" aria-hidden="true" />{t("invoiceAccess.sending")}</> : t("invoiceAccess.sendNewLink")}
              </button>
            )}

            {(nachschub === "adresse" || nachschub === "adresse_sendet") && (
              <form onSubmit={neuerLinkPerAdresse} noValidate>
                <div className="iac-field">
                  <label htmlFor="iac-mail" className="iac-label">{t("invoiceAccess.email")}</label>
                  <div className="iac-wrap">
                    <Mail size={18} className="iac-icon" aria-hidden="true" />
                    <input id="iac-mail" type="email" inputMode="email" autoComplete="email" required value={adresse} onChange={(e) => setAdresse(e.target.value)} aria-describedby="iac-mail-help" className="iac-input" />
                  </div>
                  <p id="iac-mail-help" className="iac-help">{t("invoiceAccess.emailHelp")}</p>
                </div>
                <button type="submit" className="iac-submit" disabled={nachschub === "adresse_sendet" || !adresse.trim()}>
                  {nachschub === "adresse_sendet" ? <><Loader2 size={18} className="iac-spin" aria-hidden="true" />{t("invoiceAccess.sending")}</> : t("invoiceAccess.sendNewLink")}
                </button>
              </form>
            )}

            {(nachschub === "unterwegs" || nachschub === "adresse_unterwegs") && (
              <div className="iac-ok" role="status" aria-live="polite">
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>{nachschub === "unterwegs" ? t("invoiceAccess.sentToSame") : t("invoiceAccess.sentIfKnown")}</span>
              </div>
            )}

            <a className="iac-login" href={`/patient/login?next=${encodeURIComponent(ziel)}`}>{t("invoiceAccess.alreadySetUp")}</a>
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

// Gleiche Bildsprache wie die Anmeldeseite des Patientenportals, ohne deren Animationen.
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap');
.iac-root{position:relative;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:32px 20px;background:#05070b;font-family:'DM Sans',-apple-system,sans-serif;isolation:isolate;overflow-x:hidden}
.iac-bg{position:absolute;inset:0;z-index:-1;overflow:hidden}
.iac-glow{position:absolute;width:60vmax;height:60vmax;border-radius:50%;filter:blur(90px);opacity:.4}
.iac-glow-1{top:-26vmax;left:-16vmax;background:radial-gradient(circle,rgba(34,197,94,.5),transparent 60%)}
.iac-glow-2{bottom:-30vmax;right:-20vmax;background:radial-gradient(circle,rgba(16,185,129,.38),rgba(13,148,136,.2) 40%,transparent 65%)}
.iac-card{position:relative;width:100%;max-width:440px;box-sizing:border-box;background:linear-gradient(160deg,rgba(255,255,255,.08),rgba(255,255,255,.025));backdrop-filter:blur(26px) saturate(150%);-webkit-backdrop-filter:blur(26px) saturate(150%);border:1px solid rgba(255,255,255,.12);border-radius:24px;padding:32px 30px;box-shadow:0 30px 70px -24px rgba(0,0,0,.8),inset 0 1px 0 rgba(255,255,255,.1);overflow:hidden;color:#fff}
.iac-sheen{position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(34,197,94,.85),transparent)}
.iac-head{margin-bottom:18px}
.iac-brand{margin:0;font:700 28px/1.1 'Fraunces',serif;letter-spacing:-.02em}
.iac-tag{margin:4px 0 0;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.26em;color:#7fd8a8}
.iac-divider{height:1px;margin:0 0 22px;background:linear-gradient(90deg,rgba(255,255,255,.14),transparent)}
.iac-step{margin:0 0 8px;color:#9be3bb;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.iac-title{margin:0 0 6px;font:700 22px/1.2 'Fraunces',serif}
.iac-sub{margin:0 0 22px;color:#b8bcc4;font-size:15px;line-height:1.55}
.iac-error{display:flex;align-items:flex-start;gap:8px;margin:0 0 18px;padding:12px 14px;border:1px solid rgba(248,113,113,.35);border-radius:12px;background:rgba(248,113,113,.1);color:#fca5a5;font-size:14px;line-height:1.45}
.iac-error svg{flex:0 0 auto;margin-top:2px}
.iac-field{margin-bottom:16px}
.iac-label{display:block;margin-bottom:6px;color:#c4c8d0;font-size:12px;font-weight:600;letter-spacing:.07em;text-transform:uppercase}
.iac-wrap{position:relative}
.iac-icon{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:#8b90a0;pointer-events:none}
.iac-wrap:focus-within .iac-icon{color:#22c55e}
.iac-input{width:100%;box-sizing:border-box;min-height:52px;padding:14px 16px 14px 44px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(8,10,16,.6);color:#fff;font:16px 'DM Sans',sans-serif;outline:none;transition:border-color .2s,box-shadow .2s,background .2s}
.iac-input:hover{border-color:rgba(255,255,255,.18)}
.iac-input:focus{border-color:rgba(34,197,94,.7);background:rgba(8,10,16,.82);box-shadow:0 0 0 3px rgba(34,197,94,.25)}
.iac-input.is-wrong{border-color:rgba(248,113,113,.85);box-shadow:0 0 0 3px rgba(248,113,113,.18)}
.iac-input-pw{padding-right:52px}
.iac-date{color-scheme:dark}
.iac-toggle{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:0;border-radius:10px;background:none;color:#8b90a0;cursor:pointer}
.iac-toggle:hover{color:#fff;background:rgba(255,255,255,.06)}
.iac-toggle:focus-visible{outline:2px solid rgba(34,197,94,.7);outline-offset:2px}
.iac-help{margin:8px 2px 0;color:#aeb4bd;font-size:13px;line-height:1.5}
.iac-help.is-wrong{color:#fca5a5;font-weight:600}
.iac-submit{width:100%;min-height:54px;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:8px;padding:15px;border:0;border-radius:14px;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font:700 16px 'DM Sans',sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.35);cursor:pointer;box-shadow:0 12px 34px -8px rgba(34,197,94,.65),inset 0 1px 0 rgba(255,255,255,.25)}
.iac-submit:hover:not(:disabled){filter:brightness(1.07)}
.iac-submit:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(34,197,94,.45)}
.iac-submit:disabled{opacity:.7;cursor:wait}
.iac-foot{display:flex;align-items:center;justify-content:center;gap:6px;margin:18px 0 0;color:#9296a2;font-size:12.5px;text-align:center}
.iac-done{text-align:center}
.iac-done-icon{color:#4ade80;margin:4px auto 12px}
.iac-ok{display:flex;align-items:flex-start;gap:8px;margin:4px 0 0;padding:13px 14px;border:1px solid rgba(34,197,94,.3);border-radius:12px;background:rgba(34,197,94,.08);color:#c8ead7;font-size:14px;line-height:1.5}
.iac-ok svg{flex:0 0 auto;margin-top:2px;color:#7fd8a8}
.iac-login{display:block;margin:18px 0 0;color:#7fd8a8;font:600 14px/1.5 'DM Sans',sans-serif;text-align:center;text-underline-offset:3px}
.iac-login:hover{color:#a7f3c7}
.iac-login:focus-visible{outline:2px solid rgba(34,197,94,.7);outline-offset:4px;border-radius:4px}
.iac-spin{animation:iacSpin .8s linear infinite}
@keyframes iacSpin{to{transform:rotate(360deg)}}
@media (max-width:460px){.iac-root{align-items:flex-start;padding:18px 12px 28px}.iac-card{padding:26px 20px;border-radius:20px}}
@media (prefers-reduced-motion:reduce){.iac-spin{animation:none}}
`;
