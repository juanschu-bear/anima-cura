"use client";

import { AlertTriangle, Bell, CheckCircle2, MessageCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";

type Meldung = { id: string; kind: "wunsch_status" | "antwort" | "update" | "wichtig"; title: string; text: string; link: string; createdAt: string; readAt: string | null };
type Liste = { notifications: Meldung[]; unreadCount: number; total: number; nextOffset: number | null };
type Neuerung = { id: string; title: string; summary?: string; body: string; publishedAt: string | null; requiresAcknowledgement: boolean; acknowledgedAt: string | null; readAt: string | null };

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
  const box = useRef<HTMLDivElement>(null);

  const laden = useCallback(async () => {
    try {
      const res = await fetch("/api/practice-notifications?offset=0&lang=de", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message ?? t("scribe.bell.unavailable"));
      setListe(json as Liste);
      setFehler(null);
      if ((json as Liste).notifications.some((n) => linkZiel(n.link).inbox)) {
        const inbox = await fetch("/api/scribe/inbox", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (inbox?.eintraege) setTitel(Object.fromEntries((inbox.eintraege as Array<{ id: string; titel: string }>).map((e) => [e.id, e.titel])));
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

  async function bestaetigen(id: string) {
    const res = await fetch(`/api/praxis-updates/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "acknowledge" }) }).catch(() => null);
    if (res?.ok) setNeuerung((alt) => (alt && typeof alt === "object" ? { ...alt, acknowledgedAt: new Date().toISOString(), readAt: alt.readAt ?? new Date().toISOString() } : alt));
  }

  const ungelesen = liste?.unreadCount ?? 0;
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
        className={`glocke-knopf${ungelesen > 0 ? " hat-neu" : ""}`}
        aria-expanded={offen}
        aria-label={ungelesen > 0 ? t("scribe.bell.ariaUnread", "de", { n: ungelesen }) : t("scribe.bell.aria")}
        onClick={() => { setOffen((o) => !o); setNeuerung(null); if (!offen) void laden(); }}
      >
        <span key={wackeln} className={wackeln > 0 ? "glocke-symbol wackelt" : "glocke-symbol"}><Bell size={17} /></span>
        {ungelesen > 0 && <span className="glocke-neu-text">{t("scribe.bell.newCount", "de", { n: ungelesen > 99 ? "99+" : ungelesen })}</span>}
      </button>
      {offen && (
        <div className="glocke-panel" role="dialog" aria-label={t("scribe.bell.title")}>
          {neuerung ? (
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
