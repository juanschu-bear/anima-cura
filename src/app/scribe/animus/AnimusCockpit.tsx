"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimusHud } from "@/vendor/animus-react";
import type { AnimusHandle, AnimusPatient, DokuEntwurf, Gender } from "@/vendor/animus-react/types";

// Rohe Stammdaten eines aktiven Patienten, serverseitig geladen (page.tsx).
export type AktiverPatient = {
  id: string;
  vorname: string;
  nachname: string;
  geschlecht: string | null;
  geburtsdatum: string | null;
  behandlung: string | null;
  kasse: string | null;
  telefon: string | null;
  mobiltelefon: string | null;
  email: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
};

// Treffer der bestehenden Patientensuche (/api/praxis/search), nur Fallback.
type SucheTreffer = {
  id: string;
  name: string;
  vorname?: string;
  nachname?: string;
  geschlecht?: string | null;
  geburtsdatum?: string | null;
  behandlung?: string | null;
  kasse?: string | null;
  telefon?: string;
  mobiltelefon?: string;
  email?: string;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
};
type SucheAntwort = { results?: SucheTreffer[]; error?: string };

type Hinweis = { art: "fehler" | "ok"; text: string } | null;

// Karten-Optik 1:1 aus ANIMUS-MOCKUP.html (.card), gescoped unter dem Cockpit.
const CARD_CSS = `
.animus-cockpit .card{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(.96);z-index:6;width:min(340px,86vw);background:rgba(8,16,28,.92);border:1px solid #5ED9FF;border-radius:16px;padding:22px 22px 20px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 0 50px rgba(94,217,255,.25);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;font-family:"JetBrains Mono",ui-monospace,monospace;color:#CFE6FF}
.animus-cockpit .card.an{opacity:1;transform:translate(-50%,-50%) scale(1);pointer-events:auto}
.animus-cockpit .card h3{font-family:'Orbitron',system-ui,sans-serif;font-size:18px;margin:0 0 2px;color:#EAF6FF}
.animus-cockpit .card .meta{font-size:11px;color:#5E7A96;letter-spacing:.1em;margin-bottom:16px}
.animus-cockpit .card .zeile{display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:7px 0;border-bottom:1px solid rgba(94,217,255,.18)}
.animus-cockpit .card .zeile .k{color:#5E7A96;white-space:nowrap}
.animus-cockpit .card .zeile .v{color:#5ED9FF;font-weight:600;text-align:right;word-break:break-word}
.animus-cockpit .card .kartei{display:inline-block;margin-top:16px;font-size:12px;color:#5ED9FF;text-decoration:none;letter-spacing:.04em}
.animus-cockpit .card .kartei:hover{text-decoration:underline}
.animus-cockpit .card .x{position:absolute;top:12px;right:14px;cursor:pointer;color:#5E7A96;font-size:16px;border:0;background:0}
.animus-cockpit .card .x:hover{color:#fff}
`;

// Alter aus Geburtsdatum, identisch zur Cockpit-Logik (berechneAlter).
function berechneAlter(geburtsdatum: string | null): number | null {
  if (!geburtsdatum) return null;
  const g = new Date(geburtsdatum);
  if (isNaN(g.getTime())) return null;
  const h = new Date();
  let alter = h.getFullYear() - g.getFullYear();
  const m = h.getMonth() - g.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < g.getDate())) alter--;
  return alter;
}

function formatDatum(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

// DB-Geschlecht auf die Orb-Farbe abbilden. 'd' behaelt eine eigene Farbe.
function mapGender(g: string | null): Gender {
  if (g === "w") return "w";
  if (g === "d") return "d";
  return "m";
}

function vollName(p: AktiverPatient): string {
  return `${p.vorname} ${p.nachname}`.trim();
}

function normalisiereName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function trefferZuPatient(treffer: SucheTreffer): AktiverPatient {
  const fallbackName = treffer.name.trim().split(/\s+/);
  const fallbackVorname = fallbackName.slice(0, -1).join(" ") || fallbackName[0] || treffer.name;
  const fallbackNachname = fallbackName.slice(-1).join(" ");
  return {
    id: treffer.id,
    vorname: treffer.vorname ?? fallbackVorname,
    nachname: treffer.nachname ?? fallbackNachname,
    geschlecht: treffer.geschlecht ?? null,
    geburtsdatum: treffer.geburtsdatum ?? null,
    behandlung: treffer.behandlung ?? null,
    kasse: treffer.kasse ?? null,
    telefon: treffer.telefon ?? null,
    mobiltelefon: treffer.mobiltelefon ?? null,
    email: treffer.email ?? null,
    strasse: treffer.strasse ?? null,
    plz: treffer.plz ?? null,
    ort: treffer.ort ?? null,
  };
}

function animusPatientZuKarte(patient: AnimusPatient): AktiverPatient {
  const parts = patient.name.trim().split(/\s+/);
  const vorname = parts.slice(0, -1).join(" ") || parts[0] || patient.name;
  const nachname = parts.slice(-1).join(" ") || "";
  const thisYear = new Date().getFullYear();
  const birthYear = typeof patient.age === "number" ? Math.max(1900, thisYear - patient.age) : null;
  const geburtsdatum = birthYear ? `${birthYear}-01-01` : null;
  return {
    id: patient.id ?? `animus-${normalisiereName(patient.name).replace(/\s+/g, "-") || "patient"}`,
    vorname,
    nachname,
    geschlecht: patient.gender === "d" ? "d" : patient.gender,
    geburtsdatum,
    behandlung: patient.treatment ?? null,
    kasse: null,
    telefon: null,
    mobiltelefon: null,
    email: null,
    strasse: null,
    plz: null,
    ort: null,
  };
}

function waehleExaktenTreffer(name: string, treffer: SucheTreffer[]): SucheTreffer | null {
  const exakt = treffer.filter((eintrag) => normalisiereName(eintrag.name) === normalisiereName(name));
  if (exakt.length === 1) return exakt[0];
  return null;
}

function karteiTelefon(patient: AktiverPatient | null): string {
  return patient?.telefon || patient?.mobiltelefon || "—";
}

function karteiOrt(patient: AktiverPatient | null): string {
  if (!patient) return "—";
  const ortsteil = [patient.plz, patient.ort].filter(Boolean).join(" ");
  return [patient.strasse, ortsteil].filter(Boolean).join(", ") || patient.ort || "—";
}

// ANIMUS-HUD im AnimaScribe-Account. Das HUD zeigt die aktiven Patienten als
// Knoten. Beim Aufruf oder Klick zeigt die Karte hier die echten Stammdaten und
// verlinkt die volle Kartei. Der Speicherweg liegt in dieser Komponente und
// schreibt ueber die eingeloggte Session exakt wie der Cockpit-Bestaetigen-Flow
// (POST /api/doku/eintrag, bestaetigen:true -> Version 1, Kuerzel, §630f-Zeile).
export default function AnimusCockpit({
  tokenEndpoint,
  nutzerName,
  patienten,
}: {
  tokenEndpoint: string;
  nutzerName: string;
  patienten: AktiverPatient[];
}) {
  // Knoten fuers HUD (stabil, sonst baut die Szene bei jedem Render neu auf).
  const hudPatients = useMemo<AnimusPatient[]>(
    () =>
      patienten.map((p) => ({
        id: p.id,
        name: vollName(p),
        gender: mapGender(p.geschlecht),
        age: berechneAlter(p.geburtsdatum) ?? undefined,
        treatment: p.behandlung ?? undefined,
      })),
    [patienten]
  );

  // id -> Stammdaten fuer die Karte; voller Name -> id (nur eindeutige) als
  // Fallback der id-Aufloesung.
  const byId = useMemo(() => new Map(patienten.map((p) => [p.id, p])), [patienten]);
  const byName = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of patienten) {
      const k = normalisiereName(vollName(p));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const map = new Map<string, string>();
    for (const p of patienten) {
      const k = normalisiereName(vollName(p));
      if (counts.get(k) === 1) map.set(k, p.id);
    }
    return map;
  }, [patienten]);

  // Imperativer Griff auf die Szene, um beim Schliessen der Karte wieder
  // herauszuzoomen.
  const hudRef = useRef<AnimusHandle>(null);

  // Zuletzt fokussierter Patient (Klick oder Aufruf) und zuletzt gesprochener
  // Name. Beides dient beim Bestaetigen als Schluessel auf die echte id.
  const letzterFokusId = useRef<string | null>(null);
  const letzterName = useRef<string>("");
  const [karte, setKarte] = useState<AktiverPatient | null>(null);
  const [offen, setOffen] = useState(false);
  const [hinweis, setHinweis] = useState<Hinweis>(null);

  const oeffneKarte = useCallback((patient: AktiverPatient) => {
    letzterFokusId.current = patient.id;
    letzterName.current = vollName(patient);
    setKarte(patient);
    setOffen(true);
  }, []);

  const resolvePatient = useCallback(async (patient: AnimusPatient): Promise<AktiverPatient | null> => {
    if (patient.id) {
      const loadedById = byId.get(patient.id);
      if (loadedById) return loadedById;
      const byIdRes = await fetch(`/api/praxis/search?id=${encodeURIComponent(patient.id)}`);
      if (byIdRes.ok) {
        const json = (await byIdRes.json()) as SucheAntwort;
        if (json.results?.[0]) return trefferZuPatient(json.results[0]);
      }
    }

    const name = patient.name.trim();
    if (!name) return null;

    const loadedByNameId = byName.get(normalisiereName(name));
    if (loadedByNameId) return byId.get(loadedByNameId) ?? null;

    const res = await fetch(`/api/praxis/search?q=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as SucheAntwort;
    const treffer = json.results ?? [];
    if (treffer.length === 1) return trefferZuPatient(treffer[0]);
    const exakt = waehleExaktenTreffer(name, treffer);
    return exakt ? trefferZuPatient(exakt) : null;
  }, [byId, byName]);

  const merkeFokus = useCallback(
    (p: AnimusPatient) => {
      if (p.id) {
        letzterFokusId.current = p.id;
        const daten = byId.get(p.id) ?? null;
        if (daten) {
          oeffneKarte(daten);
          return;
        }
      }
      if (p.name.trim()) letzterName.current = p.name.trim();
      void resolvePatient(p).then((daten) => {
        if (daten) oeffneKarte(daten);
      });
    },
    [byId, oeffneKarte, resolvePatient]
  );

  // Szene hat den Fokus verloren (Leerklick oder imperatives unfocus): Karte zu.
  // Inhalt bleibt fuer die Ausblend-Transition stehen.
  const schliesseKarte = useCallback(() => setOffen(false), []);

  // X-Button: erst die Kugel herauszoomen (scene.unfocus), das loest dann ueber
  // onPatientUnfocus das Schliessen der Karte aus.
  const kartenXKlick = useCallback(() => {
    setOffen(false);
    if (hudRef.current) hudRef.current.unfocus();
  }, []);

  const merkeAufruf = useCallback((p: AnimusPatient) => {
    if (p.name.trim()) letzterName.current = p.name.trim();
    const ausListe = p.id ? byId.get(p.id) ?? null : null;
    oeffneKarte(ausListe ?? animusPatientZuKarte(p));
    void resolvePatient(p).then((daten) => {
      if (daten) oeffneKarte(daten);
    });
  }, [byId, oeffneKarte, resolvePatient]);

  const merkeDokuPatient = useCallback((_entwurf: DokuEntwurf, patient: string) => {
    if (patient.trim()) letzterName.current = patient.trim();
  }, []);

  // Echte patient_id bestimmen. Primaer aus der geladenen Liste (zuletzt
  // fokussierter Patient, sonst eindeutiger Namenstreffer). /api/praxis/search
  // bleibt nur Fallback. Bei 0 oder mehreren Treffern wird nichts gespeichert.
  const findePatientId = useCallback(
    async (entwurf: DokuEntwurf): Promise<string> => {
      if (letzterFokusId.current) return letzterFokusId.current;

      const name = (letzterName.current || entwurf.patient_id || "").trim();
      const ausListe = byName.get(normalisiereName(name));
      if (ausListe) return ausListe;

      if (name.length < 2) {
        throw new Error("Kein eindeutiger Patient aus dem Diktat. Bitte Patient zuerst aufrufen.");
      }
      const res = await fetch(`/api/praxis/search?q=${encodeURIComponent(name)}`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as SucheAntwort;
        throw new Error(json.error ?? "Patientensuche fehlgeschlagen.");
      }
      const { results } = (await res.json()) as SucheAntwort;
      const treffer = results ?? [];
      if (treffer.length === 0) throw new Error(`Kein Patient zu "${name}" gefunden.`);
      if (treffer.length > 1) {
        throw new Error(`"${name}" ist nicht eindeutig (${treffer.length} Treffer). Bitte im Cockpit dokumentieren.`);
      }
      return treffer[0].id;
    },
    [byName]
  );

  // Bestaetigen in der Doku-Flaeche: Entwurf ueber die eingeloggte Session in die
  // Akte schreiben. Bei Fehler wird geworfen, damit die Flaeche offen bleibt.
  const speichern = useCallback(
    async (entwurf: DokuEntwurf) => {
      setHinweis(null);
      try {
        const patientId = await findePatientId(entwurf);

        const res = await fetch("/api/doku/eintrag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_id: patientId,
            vorlage_id: entwurf.vorlage_id ?? null,
            behandlungsart: entwurf.behandlungsart ?? null,
            termin_typ: entwurf.termin_typ ?? null,
            text: entwurf.text,
            zaehne: entwurf.zaehne,
            variablen: entwurf.variablen,
            auswahl: entwurf.auswahl,
            positionen: entwurf.positionen,
            bestaetigen: true,
          }),
        });

        if (!res.ok) {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(json.error ?? "Eintrag konnte nicht gespeichert werden.");
        }

        const json = (await res.json()) as { eintrag: { version: number } };
        setHinweis({ art: "ok", text: `Eintrag bestaetigt (Version ${json.eintrag.version}).` });
      } catch (e) {
        const text = e instanceof Error ? e.message : "Eintrag konnte nicht gespeichert werden.";
        setHinweis({ art: "fehler", text });
        throw e instanceof Error ? e : new Error(text);
      }
    },
    [findePatientId]
  );

  const alter = karte ? berechneAlter(karte.geburtsdatum) : null;

  return (
    <div className="animus-cockpit" style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden" }}>
      <style>{CARD_CSS}</style>

      <AnimusHud
        ref={hudRef}
        tokenEndpoint={tokenEndpoint}
        greetingLead="Guten Tag,"
        userName="Dr. Schubert"
        wakeWord
        wakeWordPhrases={["hey animus", "hallo animus", "ok animus", "okay animus"]}
        patients={hudPatients}
        showCard={false}
        onPatientFocus={merkeFokus}
        onPatientUnfocus={schliesseKarte}
        onPatientCall={merkeAufruf}
        onDokuOpen={merkeDokuPatient}
        onDokuConfirm={speichern}
        style={{ width: "100%", height: "100%" }}
      />

      <div className={`card ${offen ? "an" : ""}`} aria-hidden={!offen}>
        <button className="x" type="button" onClick={kartenXKlick} aria-label="schliessen">✕</button>
        <h3>{karte ? vollName(karte) : "—"}</h3>
        <div className="meta">{alter != null ? `${alter} Jahre · ` : ""}geb. {formatDatum(karte?.geburtsdatum ?? null)}</div>
        <div className="zeile"><span className="k">Behandlung</span><span className="v">{karte?.behandlung ?? "—"}</span></div>
        <div className="zeile"><span className="k">Kasse</span><span className="v">{karte?.kasse ?? "—"}</span></div>
        <div className="zeile"><span className="k">Telefon</span><span className="v">{karteiTelefon(karte)}</span></div>
        <div className="zeile"><span className="k">E-Mail</span><span className="v">{karte?.email ?? "—"}</span></div>
        <div className="zeile"><span className="k">Ort</span><span className="v">{karteiOrt(karte)}</span></div>
        {karte && (
          <a className="kartei" href={`/patienten/${karte.id}`} target="_blank" rel="noreferrer">
            Kartei öffnen ↗
          </a>
        )}
      </div>

      {!tokenEndpoint && (
        <div style={banner("fehler")}>
          NEXT_PUBLIC_ANIMUS_TOKEN_ENDPOINT ist nicht gesetzt. Animus kann sich nicht verbinden.
        </div>
      )}

      {hinweis && (
        <div style={banner(hinweis.art)} onClick={() => setHinweis(null)}>
          {hinweis.text}
        </div>
      )}
    </div>
  );
}

const MONO = '"JetBrains Mono", ui-monospace, monospace';

function banner(art: "fehler" | "ok"): React.CSSProperties {
  return {
    position: "absolute",
    top: 20,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 40,
    maxWidth: "90%",
    padding: "10px 18px",
    borderRadius: 10,
    fontSize: 13,
    fontFamily: MONO,
    cursor: "pointer",
    color: "#fff",
    background: art === "fehler" ? "rgba(220,38,38,.92)" : "rgba(22,163,74,.92)",
    boxShadow: "0 10px 30px rgba(0,0,0,.4)",
  };
}
