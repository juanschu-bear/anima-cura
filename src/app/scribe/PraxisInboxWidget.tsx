"use client";

import { Lightbulb, MessageCircleMore, Sparkles, CircleAlert, ListTodo, CheckCheck, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useThema } from "./ScribeShell";

type InboxStatus = "offen" | "in_arbeit" | "erledigt";
type InboxArt = "anliegen" | "idee" | "aufgabe" | "frage" | "inspiration";

type InboxEintrag = {
  id: string;
  art: InboxArt;
  titel: string;
  text: string | null;
  kategorie: string;
  prioritaet: "niedrig" | "mittel" | "hoch";
  bereich: string | null;
  status: InboxStatus;
  faellig_am: string;
  erstellt_von_name: string | null;
  erstellt_am: string;
  istHeute: boolean;
};

type ApiAntwort = {
  eintraege: InboxEintrag[];
  offenHeute: number;
  heute: string;
};

const ARTEN: Array<{ key: InboxArt; label: string; icon: typeof Lightbulb }> = [
  { key: "anliegen", label: "Anliegen", icon: MessageCircleMore },
  { key: "idee", label: "Idee", icon: Lightbulb },
  { key: "aufgabe", label: "Aufgabe", icon: ListTodo },
  { key: "frage", label: "Frage", icon: CircleAlert },
  { key: "inspiration", label: "Inspiration", icon: Sparkles },
];

const KATEGORIEN = ["Praxis", "Ablauf", "Behandlung", "Abrechnung", "Design", "Wunsch", "Fehler"];
const BEREICHE = ["Scribe", "Textbausteine", "Terminarten", "Behandlungsarten", "Dokumentation", "Design"];
const PRIORITAETEN = [
  { key: "niedrig", label: "Später" },
  { key: "mittel", label: "Normal" },
  { key: "hoch", label: "Wichtig" },
] as const;
const ERINNERUNGEN = [
  { key: "heute", label: "Heute" },
  { key: "morgen", label: "Morgen" },
  { key: "diese_woche", label: "Diese Woche" },
] as const;

const DEFAULT_FORM = {
  art: "anliegen" as InboxArt,
  titel: "",
  text: "",
  kategorie: "Praxis",
  prioritaet: "mittel" as "niedrig" | "mittel" | "hoch",
  bereich: "Scribe",
  erinnerung: "heute" as "heute" | "morgen" | "diese_woche",
};

function formatFaelligkeit(iso: string): string {
  const datum = new Date(`${iso}T12:00:00`);
  return Number.isNaN(datum.getTime()) ? iso : datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

export default function PraxisInboxWidget() {
  const { thema } = useThema();
  const [offen, setOffen] = useState(false);
  const [laedt, setLaedt] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [daten, setDaten] = useState<ApiAntwort | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  async function laden() {
    setLaedt(true);
    setFehler(null);
    try {
      const res = await fetch("/api/scribe/inbox", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ApiAntwort | { error?: string } | null;
      if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? "Praxis-Inbox konnte nicht geladen werden.");
      setDaten(json as ApiAntwort);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Praxis-Inbox konnte nicht geladen werden.");
    } finally {
      setLaedt(false);
    }
  }

  useEffect(() => {
    void laden();
  }, []);

  async function speichern() {
    if (!form.text.trim()) {
      setFehler("Bitte kurz beschreiben, was festgehalten werden soll.");
      return;
    }
    setSpeichert(true);
    setFehler(null);
    try {
      const res = await fetch("/api/scribe/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Eintrag konnte nicht gespeichert werden.");
      setForm(DEFAULT_FORM);
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setSpeichert(false);
    }
  }

  async function statusSetzen(id: string, status: InboxStatus) {
    setFehler(null);
    try {
      const res = await fetch("/api/scribe/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Status konnte nicht aktualisiert werden.");
      await laden();
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Status konnte nicht aktualisiert werden.");
    }
  }

  const heuteListe = useMemo(
    () => (daten?.eintraege ?? []).filter((eintrag) => eintrag.status !== "erledigt" && eintrag.istHeute),
    [daten],
  );
  const spaeterListe = useMemo(
    () => (daten?.eintraege ?? []).filter((eintrag) => eintrag.status !== "erledigt" && !eintrag.istHeute),
    [daten],
  );
  const erledigtListe = useMemo(
    () => (daten?.eintraege ?? []).filter((eintrag) => eintrag.status === "erledigt").slice(0, 4),
    [daten],
  );

  return (
    <div className={`praxis-inbox${offen ? " offen" : ""}`} data-thema={thema}>
      {offen && (
        <aside className="praxis-inbox-panel" aria-label="Praxis-Inbox">
          <div className="praxis-inbox-kopf">
            <div>
              <p className="praxis-inbox-eyebrow">Praxis-Inbox</p>
              <h3>Ideen, Anliegen und Tagesaufgaben</h3>
              <p>Alles, was spontan auffällt, landet hier und bleibt im Blick.</p>
            </div>
            <button type="button" className="praxis-inbox-close" onClick={() => setOffen(false)} aria-label="Praxis-Inbox schließen">
              ×
            </button>
          </div>

          <div className="praxis-inbox-form">
            <div className="praxis-chip-row">
              {ARTEN.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`praxis-chip${form.art === key ? " aktiv" : ""}`}
                  onClick={() => setForm((alt) => ({ ...alt, art: key }))}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            <textarea
              className="praxis-inbox-textarea"
              rows={4}
              placeholder="Was ist dir gerade aufgefallen, was sollten wir verbessern oder festhalten?"
              value={form.text}
              onChange={(e) => setForm((alt) => ({ ...alt, text: e.target.value }))}
            />

            <input
              className="praxis-inbox-input"
              type="text"
              placeholder="Kurzer Titel (optional)"
              value={form.titel}
              onChange={(e) => setForm((alt) => ({ ...alt, titel: e.target.value }))}
            />
            <p className="praxis-inbox-minihelp">Wenn du keinen Titel einträgst, bildet Scribe ihn automatisch aus deinem Text.</p>

            <div className="praxis-inbox-grid">
              <div>
                <span className="praxis-inbox-label">Kategorie</span>
                <div className="praxis-chip-row klein">
                  {KATEGORIEN.map((eintrag) => (
                    <button
                      key={eintrag}
                      type="button"
                      className={`praxis-chip klein${form.kategorie === eintrag ? " aktiv" : ""}`}
                      onClick={() => setForm((alt) => ({ ...alt, kategorie: eintrag }))}
                    >
                      {eintrag}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="praxis-inbox-label">Bereich</span>
                <select
                  className="praxis-inbox-select"
                  value={form.bereich}
                  onChange={(e) => setForm((alt) => ({ ...alt, bereich: e.target.value }))}
                >
                  {BEREICHE.map((eintrag) => <option key={eintrag} value={eintrag}>{eintrag}</option>)}
                </select>
              </div>
            </div>

            <div className="praxis-inbox-grid komprimiert">
              <div>
                <span className="praxis-inbox-label">Priorität</span>
                <div className="praxis-chip-row klein">
                  {PRIORITAETEN.map((eintrag) => (
                    <button
                      key={eintrag.key}
                      type="button"
                      className={`praxis-chip klein${form.prioritaet === eintrag.key ? " aktiv" : ""}`}
                      onClick={() => setForm((alt) => ({ ...alt, prioritaet: eintrag.key }))}
                    >
                      {eintrag.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="praxis-inbox-label">Auf die Liste</span>
                <div className="praxis-chip-row klein">
                  {ERINNERUNGEN.map((eintrag) => (
                    <button
                      key={eintrag.key}
                      type="button"
                      className={`praxis-chip klein${form.erinnerung === eintrag.key ? " aktiv" : ""}`}
                      onClick={() => setForm((alt) => ({ ...alt, erinnerung: eintrag.key }))}
                    >
                      {eintrag.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="praxis-inbox-actions">
              <button type="button" className="praxis-inbox-save" onClick={() => void speichern()} disabled={speichert}>
                {speichert ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                Eintrag festhalten
              </button>
              <button type="button" className="praxis-inbox-refresh" onClick={() => void laden()} disabled={laedt}>
                Aktualisieren
              </button>
            </div>
            {fehler && <p className="praxis-inbox-fehler">{fehler}</p>}
          </div>

          <div className="praxis-inbox-liste">
            <div className="praxis-listenblock">
              <div className="praxis-listenblock-kopf">
                <h4>Heute im Blick</h4>
                <span>{heuteListe.length}</span>
              </div>
              {laedt ? (
                <p className="praxis-inbox-leer">Lade Liste …</p>
              ) : heuteListe.length === 0 ? (
                <p className="praxis-inbox-leer">Für heute ist gerade alles abgearbeitet.</p>
              ) : (
                heuteListe.map((eintrag) => (
                  <article key={eintrag.id} className={`praxis-item prioritaet-${eintrag.prioritaet}`}>
                    <div className="praxis-item-meta">
                      <span className="praxis-art">{eintrag.art}</span>
                      <span className="praxis-kategorie">{eintrag.kategorie}</span>
                      {eintrag.bereich && <span className="praxis-bereich">{eintrag.bereich}</span>}
                    </div>
                    <strong>{eintrag.titel}</strong>
                    {eintrag.text && <p>{eintrag.text}</p>}
                    <div className="praxis-item-fuss">
                      <span>{eintrag.erstellt_von_name || "Praxis"} · {formatFaelligkeit(eintrag.faellig_am)}</span>
                      <div className="praxis-item-actions">
                        <button type="button" onClick={() => void statusSetzen(eintrag.id, "in_arbeit")}>In Arbeit</button>
                        <button type="button" onClick={() => void statusSetzen(eintrag.id, "erledigt")}>Erledigt</button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="praxis-listenblock">
              <div className="praxis-listenblock-kopf">
                <h4>Demnächst</h4>
                <span>{spaeterListe.length}</span>
              </div>
              {spaeterListe.length === 0 ? (
                <p className="praxis-inbox-leer">Nichts für später vorgemerkt.</p>
              ) : (
                spaeterListe.slice(0, 4).map((eintrag) => (
                  <article key={eintrag.id} className="praxis-item kompakt">
                    <strong>{eintrag.titel}</strong>
                    <div className="praxis-item-fuss">
                      <span>{eintrag.kategorie} · {formatFaelligkeit(eintrag.faellig_am)}</span>
                      <button type="button" onClick={() => void statusSetzen(eintrag.id, "offen")}>Vorziehen</button>
                    </div>
                  </article>
                ))
              )}
            </div>

            {erledigtListe.length > 0 && (
              <div className="praxis-listenblock erledigt">
                <div className="praxis-listenblock-kopf">
                  <h4>Zuletzt erledigt</h4>
                  <CheckCheck size={15} />
                </div>
                {erledigtListe.map((eintrag) => (
                  <article key={eintrag.id} className="praxis-item kompakt erledigt">
                    <strong>{eintrag.titel}</strong>
                    <div className="praxis-item-fuss">
                      <span>{eintrag.kategorie}</span>
                      <button type="button" onClick={() => void statusSetzen(eintrag.id, "offen")}>Wieder öffnen</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      <button type="button" className="praxis-inbox-trigger" onClick={() => setOffen((alt) => !alt)} aria-expanded={offen} aria-label="Praxis-Inbox öffnen">
        <span className="praxis-inbox-trigger-ring" aria-hidden="true" />
        <span className="praxis-inbox-trigger-core">
          <Sparkles size={19} />
        </span>
        <span className="praxis-inbox-trigger-copy">
          <strong>Praxis-Inbox</strong>
          <small>Idee, Frage oder Aufgabe</small>
        </span>
        {(daten?.offenHeute ?? 0) > 0 && <span className="praxis-inbox-badge">{daten?.offenHeute}</span>}
      </button>
    </div>
  );
}
