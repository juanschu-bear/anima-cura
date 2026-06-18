"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AnimusHud } from "@/vendor/animus-react";
import type { AnimusPatient, DokuEntwurf, Gender } from "@/vendor/animus-react";

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
  email: string | null;
  ort: string | null;
};

// Treffer der bestehenden Patientensuche (/api/praxis/search), nur Fallback.
type SucheTreffer = { id: string; name: string };
type SucheAntwort = { results?: SucheTreffer[]; error?: string };

type Hinweis = { art: "fehler" | "ok"; text: string } | null;

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

// DB-Geschlecht auf die Orb-Farbe abbilden. 'd' behaelt eine eigene Farbe,
// wird also nicht als maennlich dargestellt.
function mapGender(g: string | null): Gender {
  if (g === "w") return "w";
  if (g === "d") return "d";
  return "m";
}

function vollName(p: AktiverPatient): string {
  return `${p.vorname} ${p.nachname}`.trim();
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
      const k = vollName(p).toLowerCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const map = new Map<string, string>();
    for (const p of patienten) {
      const k = vollName(p).toLowerCase();
      if (counts.get(k) === 1) map.set(k, p.id);
    }
    return map;
  }, [patienten]);

  // Zuletzt fokussierter Patient (Klick oder Aufruf) und zuletzt gesprochener
  // Name. Beides dient beim Bestaetigen als Schluessel auf die echte id.
  const letzterFokusId = useRef<string | null>(null);
  const letzterName = useRef<string>("");
  const [karte, setKarte] = useState<AktiverPatient | null>(null);
  const [hinweis, setHinweis] = useState<Hinweis>(null);

  const merkeFokus = useCallback(
    (p: AnimusPatient) => {
      if (p.id) {
        letzterFokusId.current = p.id;
        setKarte(byId.get(p.id) ?? null);
      }
      if (p.name.trim()) letzterName.current = p.name.trim();
    },
    [byId]
  );

  const merkeAufruf = useCallback((p: AnimusPatient) => {
    if (p.name.trim()) letzterName.current = p.name.trim();
  }, []);

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
      const ausListe = byName.get(name.toLowerCase());
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
    <div style={{ position: "relative", width: "100%", height: "100dvh", overflow: "hidden" }}>
      <AnimusHud
        tokenEndpoint={tokenEndpoint}
        greeting={`Guten Tag, ${nutzerName}.`}
        patients={hudPatients}
        showCard={false}
        onPatientFocus={merkeFokus}
        onPatientCall={merkeAufruf}
        onDokuOpen={merkeDokuPatient}
        onDokuConfirm={speichern}
        style={{ width: "100%", height: "100%" }}
      />

      {karte && (
        <div style={karteBox}>
          <button onClick={() => setKarte(null)} aria-label="schliessen" style={karteSchliessen}>✕</button>
          <h3 style={{ margin: "0 0 4px", fontFamily: '"Orbitron", system-ui, sans-serif', fontSize: 20 }}>
            {vollName(karte)}
          </h3>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>
            {alter != null ? `${alter} Jahre · ` : ""}geb. {formatDatum(karte.geburtsdatum)}
          </div>
          <KarteZeile k="Behandlung" v={karte.behandlung ?? "—"} />
          <KarteZeile k="Kasse" v={karte.kasse ?? "—"} />
          <KarteZeile k="Telefon" v={karte.telefon ?? "—"} />
          <KarteZeile k="E-Mail" v={karte.email ?? "—"} />
          <KarteZeile k="Ort" v={karte.ort ?? "—"} />
          <a href={`/patienten/${karte.id}`} target="_blank" rel="noreferrer" style={karteLink}>
            Kartei öffnen ↗
          </a>
        </div>
      )}

      {!tokenEndpoint && (
        <div style={banner("fehler")}>
          NEXT_PUBLIC_ANIMUS_TOKEN_ENDPOINT ist nicht gesetzt. Anima kann sich nicht verbinden.
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

const karteBox: React.CSSProperties = {
  position: "absolute",
  top: 90,
  right: 26,
  width: 300,
  padding: 18,
  borderRadius: 14,
  background: "rgba(8,14,26,.92)",
  border: "1px solid rgba(94,217,255,.35)",
  boxShadow: "0 10px 40px rgba(0,0,0,.5)",
  color: "#dfeaff",
  fontFamily: MONO,
  zIndex: 30,
};

const karteSchliessen: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 12,
  background: "none",
  border: "none",
  color: "#9fb6da",
  cursor: "pointer",
  fontSize: 16,
};

const karteLink: React.CSSProperties = {
  display: "inline-block",
  marginTop: 14,
  fontSize: 13,
  color: "#5ED9FF",
  textDecoration: "none",
};

function KarteZeile({ k, v }: { k: string; v: string }): React.ReactElement {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, padding: "4px 0" }}>
      <span style={{ opacity: 0.6, whiteSpace: "nowrap" }}>{k}</span>
      <span style={{ textAlign: "right", wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}

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
