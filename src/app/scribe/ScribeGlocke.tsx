"use client";

import { AlertTriangle, Bell, CheckCircle2, MessageCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { LEERER_ENTWURF, VORBEREITETE_NEUIGKEITEN, type Entwurf } from "./praxis-neuigkeiten";

type Meldung = { id: string; kind: "wunsch_status" | "antwort" | "update" | "wichtig"; title: string; text: string; link: string; createdAt: string; readAt: string | null };
type Liste = { notifications: Meldung[]; unreadCount: number; total: number; nextOffset: number | null };
type Neuerung = { id: string; title: string; summary?: string; body: string; publishedAt: string | null; requiresAcknowledgement: boolean; acknowledgedAt: string | null; readAt: string | null };

const umlaute: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };
function slugAus(titel: string): string {
  const tag = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const teil = titel.toLowerCase().replace(/[äöüß]/g, (z) => umlaute[z]).normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${tag}-${teil || "neuigkeit"}`.slice(0, 120).replace(/-+$/g, "");
}

/** Ereignis, mit dem die Glocke die Praxis-Inbox an einem Eintrag öffnet. */
export const INBOX_OEFFNEN = "scribe:inbox-oeffnen";

const ICON = { wunsch_status: CheckCircle2, antwort: MessageCircle, update: Sparkles, wichtig: AlertTriangle };

function vorWann(iso: string): string {
  const d = new Date(iso);
  const minuten = Math.round((Date.now() - d.getTime()) / 60000);
  if (minuten < 1) return t("scribe.bell.justNow");
  if (minuten < 60) return t("scribe.bell.minutes", "de", { n: minuten });
  const stunden = Math.round(minuten / 60);
  if (stunden < 24) return t("scribe.bell.hours", "de", { n: stunden });
  if (stunden < 48) return t("scribe.bell.yesterday");
  return d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" });
}

const linkZiel = (link: string) => {
  try {
    const url = new URL(link, "https://scribe.local");
    return { inbox: url.searchParams.get("inbox"), update: url.searchParams.get("update") };
  } catch {
    return { inbox: null, update: null };
  }
};

/**
 * Glocke oben in Scribe: Antworten und neuer Stand zu eigenen Wünschen, „Neu in Anima Cura“ und wichtige Hinweise
 * an 1 Stelle. Ein Tipp führt direkt an die Stelle (Inbox-Eintrag oder Neuerung).
 */
export default function ScribeGlocke() {
  const [offen, setOffen] = useState(false);
  const [liste, setListe] = useState<Liste | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [titel, setTitel] = useState<Record<string, string>>({});
  const [neuerung, setNeuerung] = useState<Neuerung | null | "laedt" | "fehlt">(null);
  /** Nur Juans Konto (Entwickler) schreibt Neuigkeiten für die Praxis. */
  const [entwickler, setEntwickler] = useState(false);
  /** Vorbereitete Beiträge, die noch nicht veröffentlicht sind (nur für Juans Konto). */
  const [bereit, setBereit] = useState<Entwurf[]>([]);
  const [schreiben, setSchreiben] = useState<Entwurf | null>(null);
  const [sendet, setSendet] = useState(false);
  const [hinweis, setHinweis] = useState<{ art: "ok" | "fehler"; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const laden = useCallback(async () => {
    try {
      const res = await fetch("/api/practice-notifications?offset=0&lang=de", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? t("scribe.bell.unavailable"));
      setListe(json as Liste);
      setFehler(null);
      const inbox = await fetch("/api/scribe/inbox", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (inbox?.eintraege) setTitel(Object.fromEntries((inbox.eintraege as Array<{ id: string; titel: string }>).map((e) => [e.id, e.titel])));
      const istEntwickler = !!inbox?.canSetDeveloperStatus;
      setEntwickler(istEntwickler);
      if (istEntwickler) {
        const neu = await fetch("/api/praxis-updates?lang=de&limit=100", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (neu?.updates) {
          const veroeffentlicht = new Set((neu.updates as Array<{ slug?: string }>).map((u) => u.slug));
          setBereit(VORBEREITETE_NEUIGKEITEN.filter((n) => n.slug && !veroeffentlicht.has(n.slug)));
        }
      } else {
        setBereit([]);
      }
    } catch (e) {
      setFehler((e as Error).message || t("scribe.bell.unavailable"));
    }
  }, []);

  const neuerungZeigen = useCallback(async (id: string) => {
    setOffen(true);
    setNeuerung("laedt");
    const json = await fetch("/api/praxis-updates?lang=de&limit=100", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const gefunden = (json?.updates as Neuerung[] | undefined)?.find((u) => u.id === id) ?? null;
    setNeuerung(gefunden ?? "fehlt");
    if (gefunden && !gefunden.readAt && !gefunden.requiresAcknowledgement) {
      void fetch(`/api/praxis-updates/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read" }) });
    }
  }, []);

  // Laden beim Start, danach alle 2 Minuten, solange Scribe sichtbar ist. Link mit ?update= öffnet die Neuerung.
  useEffect(() => {
    void laden();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void laden();
    }, 120_000);
    const update = new URLSearchParams(window.location.search).get("update");
    if (update) void neuerungZeigen(update);
    return () => window.clearInterval(timer);
  }, [laden, neuerungZeigen]);

  useEffect(() => {
    if (!offen) return;
    const weg = (ev: MouseEvent) => { if (box.current && !box.current.contains(ev.target as Node)) setOffen(false); };
    const taste = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOffen(false); };
    document.addEventListener("mousedown", weg);
    window.addEventListener("keydown", taste);
    return () => { document.removeEventListener("mousedown", weg); window.removeEventListener("keydown", taste); };
  }, [offen]);

  async function gelesen(id: string) {
    setListe((l) => (l ? { ...l, unreadCount: Math.max(0, l.unreadCount - 1), notifications: l.notifications.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)) } : l));
    await fetch("/api/practice-notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read", id }) }).catch(() => null);
  }

  async function alleGelesen() {
    const stichtag = liste?.notifications[0]?.createdAt ?? new Date().toISOString();
    setListe((l) => (l ? { ...l, unreadCount: 0, notifications: l.notifications.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) } : l));
    await fetch("/api/practice-notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "read_all", createdBefore: new Date(Date.parse(stichtag) + 1).toISOString() }) }).catch(() => null);
    void laden();
  }

  async function mehrLaden() {
    if (!liste?.nextOffset) return;
    const json = await fetch(`/api/practice-notifications?offset=${liste.nextOffset}&lang=de`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (json) setListe((l) => (l ? { ...json, notifications: [...l.notifications, ...json.notifications] } : json));
  }

  async function oeffnen(n: Meldung) {
    if (!n.readAt) void gelesen(n.id);
    const ziel = linkZiel(n.link);
    if (ziel.update) {
      void neuerungZeigen(ziel.update);
      return;
    }
    if (ziel.inbox) {
      setOffen(false);
      window.dispatchEvent(new CustomEvent(INBOX_OEFFNEN, { detail: ziel.inbox }));
    }
  }

  function schreibenOeffnen(vorlage?: Entwurf) {
    setHinweis(null);
    setNeuerung(null);
    setSchreiben({ ...(vorlage ?? LEERER_ENTWURF) });
  }

  async function veroeffentlichen() {
    if (!schreiben || sendet) return;
    const e = schreiben;
    if (!e.titel.trim() || !e.kurz.trim() || !e.text.trim()) {
      setHinweis({ art: "fehler", text: t("scribe.bell.write.missing") });
      return;
    }
    setSendet(true);
    setHinweis(null);
    const res = await fetch("/api/praxis-updates?lang=de", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: e.slug ?? slugAus(e.titel),
        category: e.art,
        title: { de: e.titel.trim(), en: (e.titelEn || e.titel).trim() },
        summary: { de: e.kurz.trim(), en: (e.kurzEn || e.kurz).trim() },
        body: { de: e.text.trim(), en: (e.textEn || e.text).trim() },
        requiresAcknowledgement: e.bestaetigen,
        publish: true,
      }),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSendet(false);
    if (!res?.ok) {
      if (res?.status === 409 && e.slug) {
        setSchreiben(null);
        setHinweis({ art: "ok", text: t("scribe.bell.write.already") });
        void laden();
        return;
      }
      setHinweis({ art: "fehler", text: json?.error ?? t("scribe.bell.write.failed") });
      return;
    }
    setSchreiben(null);
    setHinweis({ art: "ok", text: t("scribe.bell.write.done") });
    void laden();
  }

  async function bestaetigen(id: string) {
    const res = await fetch(`/api/praxis-updates/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge" }) }).catch(() => null);
    if (res?.ok) setNeuerung((alt) => (alt && typeof alt === "object" ? { ...alt, acknowledgedAt: new Date().toISOString(), readAt: alt.readAt ?? new Date().toISOString() } : alt));
  }

  const ungelesen = liste?.unreadCount ?? 0;
  const bereitZahl = entwickler ? bereit.length : 0;
  const auffaellig = ungelesen > 0 || bereitZahl > 0;
  // Kommt etwas Neues dazu, wackelt die Glocke 1 Mal. Der Schlüssel startet die Bewegung neu.
  const [wackeln, setWackeln] = useState(0);
  const vorher = useRef(0);
  useEffect(() => {
    if (ungelesen > vorher.current) setWackeln((w) => w + 1);
    vorher.current = ungelesen;
  }, [ungelesen]);

  return (
    <div className="glocke" ref={box}>
      <button
        type="button"
        className={`glocke-knopf${auffaellig ? " hat-neu" : ""}`}
        aria-expanded={offen}
        aria-label={ungelesen > 0 ? t("scribe.bell.ariaUnread", "de", { n: ungelesen }) : bereitZahl > 0 ? t("scribe.bell.readyCount", "de", { n: bereitZahl }) : t("scribe.bell.aria")}
        onClick={() => { setOffen((o) => !o); setNeuerung(null); if (!offen) void laden(); }}
      >
        <span key={wackeln} className={wackeln > 0 ? "glocke-symbol wackelt" : "glocke-symbol"}><Bell size={17} /></span>
        {ungelesen > 0 && <span className="glocke-neu-text">{t("scribe.bell.newCount", "de", { n: ungelesen > 99 ? "99+" : ungelesen })}</span>}
        {ungelesen === 0 && bereitZahl > 0 && <span className="glocke-neu-text">{t("scribe.bell.readyCount", "de", { n: bereitZahl })}</span>}
      </button>
      {offen && (
        <div className={`glocke-panel${schreiben ? " schreibt" : ""}`} role="dialog" aria-label={t("scribe.bell.title")}>
          {schreiben ? (
            <div className="glocke-schreiben">
              <button type="button" className="glocke-zurueck" onClick={() => { setSchreiben(null); setHinweis(null); }}>‹ {t("scribe.bell.back")}</button>
              <span className="glocke-eyebrow">{t("scribe.bell.write.eyebrow")}</span>
              <p className="glocke-schreiben-hilfe">{t("scribe.bell.write.help")}</p>
              <label>
                <span>{t("scribe.bell.write.title")}</span>
                <input value={schreiben.titel} maxLength={160} onChange={(e) => setSchreiben({ ...schreiben, titel: e.target.value })} />
              </label>
              <label>
                <span>{t("scribe.bell.write.summary")}</span>
                <textarea rows={3} value={schreiben.kurz} maxLength={500} onChange={(e) => setSchreiben({ ...schreiben, kurz: e.target.value })} />
              </label>
              <label>
                <span>{t("scribe.bell.write.body")}</span>
                <textarea rows={9} value={schreiben.text} maxLength={20000} onChange={(e) => setSchreiben({ ...schreiben, text: e.target.value })} />
              </label>
              <div className="glocke-art" role="radiogroup" aria-label={t("scribe.bell.write.kind")}>
                {(["neuerung", "hinweis", "wichtig"] as const).map((art) => (
                  <button key={art} type="button" role="radio" aria-checked={schreiben.art === art} onClick={() => setSchreiben({ ...schreiben, art })}>
                    {t(`scribe.bell.write.kind.${art}`)}
                  </button>
                ))}
              </div>
              <label className="glocke-haken">
                <input type="checkbox" checked={schreiben.bestaetigen} onChange={(e) => setSchreiben({ ...schreiben, bestaetigen: e.target.checked })} />
                <span>{t("scribe.bell.write.ack")}</span>
              </label>
              <details className="glocke-englisch">
                <summary>{t("scribe.bell.write.english")}</summary>
                <label><span>{t("scribe.bell.write.title")}</span><input value={schreiben.titelEn} maxLength={160} onChange={(e) => setSchreiben({ ...schreiben, titelEn: e.target.value })} /></label>
                <label><span>{t("scribe.bell.write.summary")}</span><textarea rows={3} value={schreiben.kurzEn} maxLength={500} onChange={(e) => setSchreiben({ ...schreiben, kurzEn: e.target.value })} /></label>
                <label><span>{t("scribe.bell.write.body")}</span><textarea rows={6} value={schreiben.textEn} maxLength={20000} onChange={(e) => setSchreiben({ ...schreiben, textEn: e.target.value })} /></label>
              </details>
              {hinweis && <p className={`glocke-hinweis ${hinweis.art}`} role={hinweis.art === "ok" ? "status" : "alert"}>{hinweis.text}</p>}
              <div className="glocke-schreiben-knoepfe">
                <button type="button" className="haupt klein" disabled={sendet} onClick={() => void veroeffentlichen()}>{sendet ? "…" : t("scribe.bell.write.publish")}</button>
                <button type="button" className="neben klein" onClick={() => { setSchreiben(null); setHinweis(null); }}>{t("scribe.blocks.cancel")}</button>
              </div>
            </div>
          ) : neuerung ? (
            <div className="glocke-neuerung">
              <button type="button" className="glocke-zurueck" onClick={() => setNeuerung(null)}>‹ {t("scribe.bell.back")}</button>
              {neuerung === "laedt" ? (
                <p className="glocke-leer" role="status">{t("scribe.bell.loading")}</p>
              ) : neuerung === "fehlt" ? (
                <p className="glocke-leer">{t("scribe.bell.updateMissing")}</p>
              ) : (
                <>
                  <span className="glocke-eyebrow">{t("scribe.bell.newInAnima")}</span>
                  <h4>{neuerung.title}</h4>
                  {neuerung.publishedAt && <small>{vorWann(neuerung.publishedAt)}</small>}
                  <p className="glocke-text">{neuerung.body}</p>
                  {neuerung.requiresAcknowledgement && (
                    neuerung.acknowledgedAt
                      ? <p className="glocke-ok">{t("scribe.bell.acknowledged")}</p>
                      : <button type="button" className="haupt klein" onClick={() => void bestaetigen(neuerung.id)}>{t("scribe.bell.acknowledge")}</button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              {bereitZahl > 0 && (
                <div className="glocke-bereit">
                  <span className="glocke-eyebrow">{t("scribe.bell.readyTitle")}</span>
                  {bereit.map((n) => (
                    <button key={n.slug} type="button" className="glocke-bereit-eintrag" onClick={() => schreibenOeffnen(n)}>
                      <b>{n.titel}</b>
                      <span>{n.kurz}</span>
                      <em>{t("scribe.bell.readyOpen")} ›</em>
                    </button>
                  ))}
                </div>
              )}
              <div className="glocke-kopf">
                <b>{t("scribe.bell.title")}</b>
                {ungelesen > 0 && <button type="button" onClick={() => void alleGelesen()}>{t("scribe.bell.readAll")}</button>}
              </div>
              {fehler ? (
                <p className="glocke-leer">{fehler}</p>
              ) : !liste ? (
                <p className="glocke-leer" role="status">{t("scribe.bell.loading")}</p>
              ) : liste.notifications.length === 0 ? (
                <p className="glocke-leer">{t("scribe.bell.empty")}</p>
              ) : (
                <ul className="glocke-liste">
                  {liste.notifications.map((n) => {
                    const Icon = ICON[n.kind] ?? Bell;
                    const eintrag = linkZiel(n.link).inbox;
                    return (
                      <li key={n.id}>
                        <button type="button" className={`glocke-eintrag art-${n.kind}${n.readAt ? "" : " neu"}`} onClick={() => void oeffnen(n)}>
                          <span className="glocke-icon" aria-hidden="true"><Icon size={15} /></span>
                          <span className="glocke-inhalt">
                            <b>{n.title}</b>
                            {eintrag && titel[eintrag] && <span className="glocke-bezug">„{titel[eintrag]}“</span>}
                            <span>{n.text}</span>
                            <small>{vorWann(n.createdAt)}</small>
                          </span>
                          {!n.readAt && <i className="glocke-punkt" aria-label={t("scribe.bell.unread")} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {liste?.nextOffset && <button type="button" className="glocke-mehr" onClick={() => void mehrLaden()}>{t("scribe.bell.more")}</button>}
              {hinweis && <p className={`glocke-hinweis ${hinweis.art}`} role={hinweis.art === "ok" ? "status" : "alert"}>{hinweis.text}</p>}
              {entwickler && (
                <button type="button" className="glocke-schreiben-knopf" onClick={() => schreibenOeffnen()}>✎ {t("scribe.bell.write.open")}</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
