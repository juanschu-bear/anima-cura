"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/db/supabase";
import { useThema } from "./ScribeShell";

/* ===== Typen (Form der doku_vorlagen.struktur / .positionen aus Seed 019b) ===== */
type Opt = { t: string; on?: boolean };
type Gruppe = { label: string; req: boolean; type: "single" | "multi"; opts: Opt[] };
type TemplateSeg = string | { g: string };
type Struktur = {
  template: TemplateSeg[];
  groups: Record<string, Gruppe>;
  vars: string[];
  kontext?: string;
  alter_min?: number;
  alter_max?: number;
  abrechnung_titel?: string;
  abrechnung_hinweis?: string;
  anima_kopplung?: string;
};
type PositionsRegel = { code: string; text: string; count?: string; if?: { g: string; i: number } };
type Vorlage = {
  id: string;
  behandlungsart: "aligner" | "removable" | "multiband";
  termin_typ: string;
  name: string;
  sort_index: number;
  struktur: Struktur;
  positionen: PositionsRegel[];
};
type PatientTreffer = { id: string; name: string; alter: number | null };
type TagesEintrag = {
  id: string;
  status: string;
  version: number;
  termin_typ: string | null;
  behandlungsart: string | null;
  ivoris_push_status: string;
  bestaetigt_am: string | null;
  text: string;
  zaehne: string[];
  positionen: { code: string; text: string; anzahl?: number }[];
  patients: { vorname: string; nachname: string } | null;
};

const ART_NAMEN: Record<string, string> = { aligner: "Aligner", multiband: "Multiband", removable: "Herausnehmbar" };
const BOGEN = ["12er NiTi", "14er NiTi", "16er NiTi", "16×22 NiTi", "16×22 Stahl", "18er Stahl"];
const FDI_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

/* Termintypen nach Phase gegliedert (Baum statt Knopfwolke) */
const PHASEN: { name: string; slugs: string[] }[] = [
  { name: "Start & Diagnostik", slugs: ["beratung", "erstuntersuchung", "diagnostik", "start", "eingliederung"] },
  { name: "Verlauf", slugs: ["kontrolle", "ip"] },
  { name: "Notfall", slugs: ["notfall"] },
  { name: "Abschluss & Retention", slugs: ["abschluss", "entbaenderung", "retention"] },
];

/* Häufige Kombis: eine Sitzung, mehrere Leistungen (Praxis-Begriffe) */
const KOMBIS: Record<string, { label: string; slugs: string[] }[]> = {
  aligner: [{ label: "Erstberatung (Anfangsdiagnostik)", slugs: ["beratung", "diagnostik"] }],
  multiband: [{ label: "Erstuntersuchung (Anfangsdiagnostik)", slugs: ["erstuntersuchung", "diagnostik"] }],
  removable: [],
};

/* Spickzettel: gegliedert nach Bereichen, durchsuchbar. */
const SPICK_BEREICHE = ["Bedienung", "Patient & Termin", "Eintrag & Versionen", "ivoris & Abrechnung"] as const;
const SPICKZETTEL: { bereich: (typeof SPICK_BEREICHE)[number]; frage: string; antwort: string }[] = [
  { bereich: "Bedienung", frage: "Was macht Anima Scribe?", antwort: "Es legt den Karteieintrag für den laufenden Termin fertig vor. Sie bestätigen, klicken Abweichungen an, fertig. Daraus entstehen zwei Dinge: der Verlaufstext für die Akte und die Abrechnungspositionen." },
  { bereich: "Bedienung", frage: "Warum ist der Bestätigen-Knopf gesperrt?", antwort: "Es fehlt etwas Pflichtiges. Daneben steht genau was, z. B. 'Gesperrt, fehlt: Befund, Patient'. Pflichtgruppen sind mit 'Pflicht' markiert." },
  { bereich: "Bedienung", frage: "Hell oder dunkel?", antwort: "Oben rechts umschalten. Die Wahl merkt sich der Browser." },
  { bereich: "Bedienung", frage: "Sind das dieselben Zugangsdaten wie bei Anima Cura?", antwort: "Ja, ein Konto für beides. Abmelden hier beendet auch die Cura-Sitzung in diesem Browser." },
  { bereich: "Patient & Termin", frage: "Wie wähle ich den Patienten?", antwort: "Oben im Termin-Bereich suchen (mindestens zwei Zeichen). Das Alter steht direkt am Namen. Mit 'wechseln' geht es zum nächsten." },
  { bereich: "Patient & Termin", frage: "Was ist die Schnellwahl mit dem Plus, z. B. Erstberatung (Anfangsdiagnostik)?", antwort: "Eine Kombi: zwei Leistungen in einer Sitzung, ein Eintrag. Sie können auch selbst stapeln, einfach mehrere Leistungen anklicken." },
  { bereich: "Patient & Termin", frage: "Warum sehe ich manche Leistungen bei diesem Patienten nicht?", antwort: "Altersregeln. Beispiel: IP-Prophylaxe ist Kassenleistung für 6- bis 17-Jährige und erscheint nur bei passendem Alter." },
  { bereich: "Patient & Termin", frage: "Wie setze ich Zähne?", antwort: "Im Zahnbogen oder im FDI-Raster anklicken, beides ist synchron. Gewählte Zähne bekommen im Bogen ein goldenes Attachment aufgesetzt, die Zahnliste landet automatisch im Text." },
  { bereich: "Eintrag & Versionen", frage: "Was passiert beim Bestätigen?", antwort: "Der Eintrag wird als Version 1 revisionssicher in Anima gespeichert. Er ist damit Teil der Akte (Aufbewahrung 10 Jahre), aber noch NICHT in ivoris." },
  { bereich: "Eintrag & Versionen", frage: "Ich habe etwas falsch eingetragen. Wie korrigiere ich?", antwort: "Einfach ändern. Der Knopf wird zu 'Als Version v2 bestätigen', ein Änderungsgrund ist Pflicht. Die alte Fassung bleibt sichtbar in der Historie, nichts wird gelöscht." },
  { bereich: "Eintrag & Versionen", frage: "Warum kann ich nichts löschen?", antwort: "Patientenakten sind gesetzlich revisionssicher (§ 630f BGB). Einträge werden versioniert, nie gelöscht. Das schützt die Praxis bei Prüfungen und Streitfällen. Korrigieren ist ausdrücklich erlaubt, nur eben sichtbar." },
  { bereich: "ivoris & Abrechnung", frage: "Wann ist der Eintrag in ivoris?", antwort: "Erst nach Klick auf 'In ivoris-Akte schreiben'. Solange zeigt die Tagesliste 'noch nicht in ivoris'. Nachholen geht jederzeit: Patientenkarte in der Tagesliste anklicken, dort steht der Knopf." },
  { bereich: "ivoris & Abrechnung", frage: "Was bedeuten die Pillen in der Tagesliste?", antwort: "Rot pulsierend: handeln (Doku offen oder Push-Fehler). Bernstein: bestätigt, aber noch nicht in ivoris. Grün: in ivoris angekommen." },
  { bereich: "ivoris & Abrechnung", frage: "Was bedeuten die zwei Karten unter Ausgänge?", antwort: "Ein Eintrag, zwei Artefakte. Links der Verlaufstext für die ivoris-Akte (rechtsverbindlich). Rechts die nackten Positionen für KZV bzw. Privatliquidation, dort gehen keine Texte hin." },
  { bereich: "ivoris & Abrechnung", frage: "Was erscheint in ivoris bei einer Korrektur?", antwort: "ivoris kann nichts überschreiben. Eine Korrektur erscheint dort als neuer Eintrag mit dem Vermerk 'KORREKTUR (v2):' davor. So bleibt alles nachvollziehbar." },
];

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

function passtAlter(v: Vorlage, alter: number | null): boolean {
  if (alter === null) return true;
  if (v.struktur.alter_min != null && alter < v.struktur.alter_min) return false;
  if (v.struktur.alter_max != null && alter > v.struktur.alter_max) return false;
  return true;
}

/* Kieferschema: fotorealistisches Schaubild (public/scribe/zahnschema.jpg),
   32 Zahn- und 32 Zahl-Hotspots, kalibriert. Klick-Zyklus: aussen -> innen -> ab. */
type Seite = "aussen" | "innen";
const ZAHN_POS: Record<number, [number, number]> = {
  18:[772,780], 17:[784,663], 16:[810,560], 15:[853,458], 14:[903,382], 13:[982,300], 12:[1053,240], 11:[1133,212],
  21:[1224,212], 22:[1303,240], 23:[1378,300], 24:[1443,382], 25:[1493,458], 26:[1532,560], 27:[1562,663], 28:[1572,780],
  48:[772,1000], 47:[780,1112], 46:[838,1222], 45:[878,1316], 44:[903,1386], 43:[975,1418], 42:[1045,1444], 41:[1120,1448],
  31:[1205,1448], 32:[1288,1444], 33:[1356,1418], 34:[1430,1386], 35:[1458,1316], 36:[1500,1222], 37:[1558,1112], 38:[1568,1000],
};
const LABEL_POS: Record<number, [number, number]> = {
  11:[990,53], 21:[1297,53], 12:[855,133], 22:[1445,133], 13:[689,242], 23:[1623,242],
  14:[570,331], 24:[1732,331], 15:[534,440], 25:[1768,440], 16:[499,550], 26:[1792,550],
  17:[459,659], 27:[1812,659], 18:[426,772], 28:[1837,772],
  48:[465,946], 38:[1792,946], 47:[485,1059], 37:[1772,1059], 46:[519,1168], 36:[1758,1168],
  45:[564,1277], 35:[1729,1277], 44:[653,1380], 34:[1693,1380], 43:[808,1451], 33:[1525,1451],
  42:[915,1574], 32:[1410,1574], 41:[1043,1643], 31:[1277,1643],
};
const BOGEN_INNEN: Record<"ok" | "uk", [number, number]> = { ok: [1168, 600], uk: [1168, 1130] };

function zahnFormel(z: number) {
  const d = z % 10;
  if (d >= 6) return { rx: 38, ry: 44 };
  if (d >= 4) return { rx: 32, ry: 36 };
  if (d === 3) return { rx: 24, ry: 38 };
  return { rx: 20, ry: 40 };
}

function seitenPunkt(z: number, seite: Seite): [number, number] {
  const [x, y] = ZAHN_POS[z];
  const ok = z < 30;
  const c = ok ? BOGEN_INNEN.ok : BOGEN_INNEN.uk;
  let dx = x - c[0], dy = y - c[1];
  const l = Math.hypot(dx, dy) || 1;
  dx /= l; dy /= l;
  const f = zahnFormel(z);
  let fx = ok ? 0.22 : 0.1, fy = ok ? 0.16 : 0.08;
  if (seite === "innen") { fx = ok ? -0.34 : -0.3; fy = ok ? -0.28 : -0.24; }
  return [x + dx * f.rx * fx, y + dy * f.ry * fy];
}

function KieferSchema({ zaehne, seiten, toggle }: { zaehne: number[]; seiten: Record<number, Seite>; toggle: (n: number) => void }) {
  return (
    <div className="kiefer-papier">
      <svg className="kieferschema" viewBox="0 0 2336 1744" role="group" aria-label="Zahnschema: Klick wechselt außen, innen, abgewählt">
        <image href="/scribe/zahnschema.jpg" width={2336} height={1744} />
        {zaehne.map((z) => {
          if (!ZAHN_POS[z]) return null;
          const seite: Seite = seiten[z] ?? "aussen";
          const innen = seite === "innen";
          const f = zahnFormel(z);
          const [x, y] = ZAHN_POS[z];
          const [lx, ly] = LABEL_POS[z];
          const [bx, by] = seitenPunkt(z, seite);
          return (
            <g key={`${z}-${seite}`} className="kiefer-mark">
              <ellipse cx={x} cy={y} rx={f.rx} ry={f.ry} className={innen ? "ktint innen" : "ktint"} />
              <rect x={lx - 62} y={ly - 38} width={124} height={76} rx={14} className={innen ? "klabel innen" : "klabel"} />
              <rect x={bx - 13} y={by - 13} width={26} height={26} transform={`rotate(45 ${bx} ${by})`} className="kdiamant" />
            </g>
          );
        })}
        {(Object.entries(ZAHN_POS) as unknown as [string, [number, number]][]).map(([zs, [x, y]]) => {
          const z = Number(zs);
          const f = zahnFormel(z);
          return (
            <ellipse key={`h${z}`} cx={x} cy={y} rx={f.rx + 18} ry={f.ry + 18} className="khotspot" onClick={() => toggle(z)}>
              <title>{`Zahn ${z}`}</title>
            </ellipse>
          );
        })}
        {(Object.entries(LABEL_POS) as unknown as [string, [number, number]][]).map(([zs, [x, y]]) => {
          const z = Number(zs);
          return (
            <rect key={`l${z}`} x={x - 62} y={y - 38} width={124} height={76} rx={14} className="khotspot" onClick={() => toggle(z)}>
              <title>{`Zahn ${z}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="kiefer-legende">
        <span className="l-aussen">1. Klick: außen (bukkal)</span>
        <span className="l-innen">2. Klick: innen (palatinal OK / lingual UK)</span>
        <span className="l-ab">3. Klick: abwählen</span>
      </div>
    </div>
  );
}

type TeamMitglied = { id: string; email: string; display_name: string; role: string; kuerzel: string | null; permissions?: { scribe_schreiben?: boolean } | null };

function PwFeld({ wert, setzen, platzhalter, label, klein, onEnter }: { wert: string; setzen: (v: string) => void; platzhalter: string; label: string; klein?: boolean; onEnter?: () => void }) {
  const [sichtbar, setSichtbar] = useState(false);
  return (
    <span className={klein ? "pwfeld klein" : "pwfeld"}>
      <input
        type={sichtbar ? "text" : "password"}
        value={wert}
        onChange={(e) => setzen(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
        placeholder={platzhalter}
        aria-label={label}
        autoComplete="new-password"
      />
      <button type="button" className="pwauge" aria-label={sichtbar ? "Passwort verbergen" : "Passwort anzeigen"} onClick={() => setSichtbar((s) => !s)}>
        {sichtbar ? "\u{1F648}" : "\u{1F441}"}
      </button>
    </span>
  );
}
const ROLLEN_INFO: { wert: string; label: string; rechte: string }[] = [
  { wert: "admin", label: "Admin", rechte: "Alles: dokumentieren, ivoris, Team & Zugänge verwalten" },
  { wert: "verwaltung", label: "Verwaltung", rechte: "Dokumentieren und ivoris-Push, keine Team-Verwaltung" },
  { wert: "lesezugriff", label: "Lesezugriff", rechte: "Nur ansehen, kein Bestätigen, kein ivoris" },
];

export default function ScribeCockpit({ nutzerName, rolle }: { nutzerName: string; rolle: string }) {
  const router = useRouter();
  const { thema, wechseln } = useThema();
  const [detail, setDetail] = useState<TagesEintrag | null>(null);
  const [detailLaeuft, setDetailLaeuft] = useState(false);
  const [detailFehler, setDetailFehler] = useState<string | null>(null);
  const [spickOffen, setSpickOffen] = useState(false);
  const [spickSuche, setSpickSuche] = useState("");
  const [spickBereich, setSpickBereich] = useState<string>("alle");
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [heute, setHeute] = useState<TagesEintrag[]>([]);

  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<PatientTreffer[]>([]);
  const [patient, setPatient] = useState<PatientTreffer | null>(null);

  const [art, setArt] = useState<string>("aligner");
  const [gewaehlt, setGewaehlt] = useState<string[]>([]); // termin_typ-Slugs, stapelbar

  const [auswahl, setAuswahl] = useState<Record<string, Record<string, number[]>>>({});
  const [zaehne, setZaehne] = useState<number[]>([]);
  const [seiten, setSeiten] = useState<Record<number, Seite>>({});
  const [schienenVon, setSchienenVon] = useState("9");
  const [schienenBis, setSchienenBis] = useState("11");
  const [bogen, setBogen] = useState(BOGEN[2]);
  const [ausnahme, setAusnahme] = useState("");

  const [sendet, setSendet] = useState(false);
  const [bestaetigt, setBestaetigt] = useState<{ id: string; version: number; am: string } | null>(null);
  const [pushStatus, setPushStatus] = useState<"offen" | "laeuft" | "gepusht" | "fehler">("offen");
  const [demo, setDemo] = useState(false);
  const [pwOffen, setPwOffen] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwLaeuft, setPwLaeuft] = useState(false);
  const [pwHinweis, setPwHinweis] = useState<{ ok: boolean; text: string } | null>(null);
  const [teamOffen, setTeamOffen] = useState(false);
  const [team, setTeam] = useState<TeamMitglied[]>([]);
  const [mailDomain, setMailDomain] = useState("praxis-schubert.de");
  const [teamHinweis, setTeamHinweis] = useState<{ ok: boolean; text: string } | null>(null);
  const [teamLaeuft, setTeamLaeuft] = useState(false);
  const [neu, setNeu] = useState({ name: "", lokal: "", rolle: "verwaltung", kuerzel: "", passwort: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [editRolle, setEditRolle] = useState("verwaltung");
  const [editKuerzel, setEditKuerzel] = useState("");
  const [editScribe, setEditScribe] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [pushInfo, setPushInfo] = useState<string | null>(null);
  const [aktionsFehler, setAktionsFehler] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [aenderungsgrund, setAenderungsgrund] = useState("");

  const ladeHeute = useCallback(async () => {
    const res = await fetch("/api/doku/heute");
    if (res.ok) {
      const json = await res.json();
      setHeute(json.eintraege ?? []);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/doku/vorlagen");
      if (!res.ok) {
        setLadefehler("Vorlagen konnten nicht geladen werden. Seite neu laden.");
        return;
      }
      const json = await res.json();
      const liste: Vorlage[] = json.vorlagen ?? [];
      setVorlagen(liste);
      const erste = liste.filter((v) => v.behandlungsart === "aligner").sort((a, b) => a.sort_index - b.sort_index)[0];
      if (erste) setGewaehlt([erste.termin_typ]);
      await ladeHeute();
    })();
  }, [ladeHeute]);

  /* Patientensuche */
  useEffect(() => {
    if (suche.trim().length < 2 || patient) {
      setTreffer([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/praxis/search?q=${encodeURIComponent(suche.trim())}`);
      if (res.ok) {
        const json = await res.json();
        setTreffer((json.results ?? []).map((r: { id: string; name: string; geburtsdatum?: string | null }) => ({ id: r.id, name: r.name, alter: berechneAlter(r.geburtsdatum ?? null) })));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [suche, patient]);

  const artVorlagen = useMemo(
    () => vorlagen.filter((v) => v.behandlungsart === art).sort((a, b) => a.sort_index - b.sort_index),
    [vorlagen, art]
  );
  const vorlageVon = useCallback(
    (slug: string) => artVorlagen.find((v) => v.termin_typ === slug) ?? null,
    [artVorlagen]
  );
  const module = useMemo(
    () => gewaehlt.map(vorlageVon).filter((v): v is Vorlage => v !== null),
    [gewaehlt, vorlageVon]
  );
  const sichtbareVorlagen = useMemo(
    () => artVorlagen.filter((v) => passtAlter(v, patient?.alter ?? null)),
    [artVorlagen, patient]
  );
  /* Wenn ein Patient gewaehlt wird, fliegen altersfremde Leistungen aus der Auswahl */
  useEffect(() => {
    setGewaehlt((alt) => {
      const erlaubt = alt.filter((slug) => sichtbareVorlagen.some((v) => v.termin_typ === slug));
      if (erlaubt.length === alt.length) return alt;
      if (erlaubt.length > 0) return erlaubt;
      return sichtbareVorlagen[0] ? [sichtbareVorlagen[0].termin_typ] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sichtbareVorlagen.map((v) => v.id).join(",")]);
  const kontext = artVorlagen[0]?.struktur.kontext ?? "";
  const abrechnungTitel = artVorlagen[0]?.struktur.abrechnung_titel ?? "Abrechnung";
  const abrechnungHinweis = artVorlagen[0]?.struktur.abrechnung_hinweis ?? "";
  const animaKopplung = artVorlagen[0]?.struktur.anima_kopplung ?? "";

  function bearbeitet() {
    setAktionsFehler(null);
    if (bestaetigt) {
      setDirty(true);
      setPushStatus("offen");
      setPushInfo(null);
    }
  }

  function resetSitzung() {
    setBestaetigt(null);
    setDirty(false);
    setAenderungsgrund("");
    setPushStatus("offen");
    setPushInfo(null);
    setAktionsFehler(null);
  }

  /* Defaults je gewähltem Modul setzen */
  useEffect(() => {
    setAuswahl((alt) => {
      const neu: Record<string, Record<string, number[]>> = {};
      module.forEach((m) => {
        if (alt[m.termin_typ]) {
          neu[m.termin_typ] = alt[m.termin_typ];
        } else {
          const start: Record<string, number[]> = {};
          Object.entries(m.struktur.groups).forEach(([g, grp]) => {
            start[g] = grp.opts.flatMap((o, i) => (o.on ? [i] : []));
          });
          neu[m.termin_typ] = start;
        }
      });
      return neu;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module.map((m) => m.id).join(",")]);

  function artWechseln(k: string) {
    setArt(k);
    const erste = vorlagen.filter((v) => v.behandlungsart === k).sort((a, b) => a.sort_index - b.sort_index)[0];
    setGewaehlt(erste ? [erste.termin_typ] : []);
    setZaehne([]);
    setSeiten({});
    setAusnahme("");
    resetSitzung();
  }

  function leistungToggle(slug: string) {
    bearbeitet();
    setGewaehlt((alt) => {
      if (alt.includes(slug)) {
        const rest = alt.filter((s) => s !== slug);
        return rest.length > 0 ? rest : alt; // mindestens eine Leistung bleibt
      }
      // Reihenfolge wie im Katalog
      const reihenfolge = artVorlagen.map((v) => v.termin_typ);
      return reihenfolge.filter((s) => alt.includes(s) || s === slug);
    });
  }

  function kombiWaehlen(slugs: string[]) {
    bearbeitet();
    const reihenfolge = artVorlagen.map((v) => v.termin_typ);
    setGewaehlt(reihenfolge.filter((s) => slugs.includes(s)));
  }

  function toggleOpt(slug: string, g: string, i: number) {
    const m = vorlageVon(slug);
    if (!m) return;
    bearbeitet();
    const grp = m.struktur.groups[g];
    setAuswahl((alt) => {
      const modul = alt[slug] ?? {};
      const akt = modul[g] ?? [];
      const neu =
        grp.type === "single"
          ? akt.includes(i) ? [] : [i]
          : akt.includes(i) ? akt.filter((x) => x !== i) : [...akt, i].sort((a, b) => a - b);
      return { ...alt, [slug]: { ...modul, [g]: neu } };
    });
  }

  function toggleZahn(n: number) {
    bearbeitet();
    const s = seiten[n];
    const neu = { ...seiten };
    if (!s) neu[n] = "aussen";
    else if (s === "aussen") neu[n] = "innen";
    else delete neu[n];
    setSeiten(neu);
    setZaehne(Object.keys(neu).map(Number).sort((a, b) => a - b));
  }

  /* Text aus allen gestapelten Modulen zusammensetzen */
  type Seg = { art: "fix" | "var" | "fehlt"; text: string };
  const komposition = useMemo(() => {
    const segs: Seg[] = [];
    const fehlt: string[] = [];

    const fuellen = (t: string): string => {
      let out = t;
      if (out.includes("{zaehne}")) {
        if (zaehne.length === 0) {
          fehlt.push("Zahnangabe (FDI)");
          out = out.replace(/\{zaehne\}/g, "⟨Zahn?⟩");
        } else {
          out = out.replace(/\{zaehne\}/g, zaehne.map((z) => seiten[z] === "innen" ? `${z} (${z < 30 ? "palatinal" : "lingual"})` : String(z)).join(", "));
        }
      }
      if (out.includes("{von}") || out.includes("{bis}")) {
        if (!schienenVon || !schienenBis) fehlt.push("Schienen-Nr.");
        out = out.replace("{von}", schienenVon || "?").replace("{bis}", schienenBis || "?");
      }
      if (out.includes("{bogen}")) out = out.replace("{bogen}", bogen);
      return out;
    };

    module.forEach((m) => {
      m.struktur.template.forEach((seg) => {
        if (typeof seg === "string") {
          segs.push({ art: "fix", text: seg });
          return;
        }
        const grp = m.struktur.groups[seg.g];
        const sel = auswahl[m.termin_typ]?.[seg.g] ?? [];
        if (sel.length === 0) {
          if (grp?.req) {
            const label = module.length > 1 ? `${grp.label} (${m.name})` : grp.label;
            fehlt.push(label);
            segs.push({ art: "fehlt", text: `[ ${label} fehlt ]` });
          }
          return;
        }
        sel.forEach((i) => segs.push({ art: "var", text: fuellen(grp.opts[i].t) + " " }));
      });
    });

    if (!patient) fehlt.push("Patient");
    if (module.length === 0) fehlt.push("Leistung");

    let text = segs.map((s) => (s.art === "fehlt" ? "" : s.text)).join("");
    if (ausnahme.trim()) text += ` Ausnahme: ${ausnahme.trim()}`;
    return { segs, fehlt: Array.from(new Set(fehlt)), text: text.trim() };
  }, [module, auswahl, zaehne, seiten, schienenVon, schienenBis, bogen, ausnahme, patient]);

  /* Positionen über alle Module auflösen */
  const positionen = useMemo(() => {
    const rows: { code: string; text: string; anzahl: number }[] = [];
    module.forEach((m) => {
      m.positionen
        .filter((r) => !r.if || (auswahl[m.termin_typ]?.[r.if.g] ?? []).includes(r.if.i))
        .forEach((r) =>
          rows.push({ code: r.code, text: r.text, anzahl: r.count === "zaehne" ? Math.max(1, zaehne.length) : 1 })
        );
    });
    return rows;
  }, [module, auswahl, zaehne]);

  const brauchtZaehne = module.some((m) => m.struktur.vars.includes("zaehne"));
  const brauchtSchienen = module.some((m) => m.struktur.vars.includes("schienen"));
  const brauchtBogen = module.some((m) => m.struktur.vars.includes("bogen"));

  async function neueVersion() {
    if (!bestaetigt || !aenderungsgrund.trim() || komposition.fehlt.length > 0) return;
    if (demo) {
      setBestaetigt({ ...bestaetigt, version: bestaetigt.version + 1, am: new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) });
      setDirty(false);
      setAenderungsgrund("");
      setPushStatus("offen");
      setPushInfo(null);
      return;
    }
    setSendet(true);
    setAktionsFehler(null);
    const res = await fetch(`/api/doku/eintrag/${bestaetigt.id}/version`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: komposition.text,
        zaehne: zaehne.map(String),
        variablen: {
          schienen_von: schienenVon,
          schienen_bis: schienenBis,
          bogen,
          zahn_seiten: seiten,
          leistungen: module.map((m) => m.name),
        },
        auswahl,
        positionen,
        ausnahme_freitext: ausnahme.trim() || null,
        aenderungsgrund: aenderungsgrund.trim(),
      }),
    });
    setSendet(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setAktionsFehler(json.error ?? "Neue Version konnte nicht gespeichert werden.");
      return;
    }
    const json = await res.json();
    setBestaetigt({
      id: json.eintrag.id,
      version: json.eintrag.version,
      am: new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }),
    });
    setDirty(false);
    setAenderungsgrund("");
    setPushStatus("offen");
    setPushInfo(null);
    await ladeHeute();
  }

  function naechsterPatient() {
    resetSitzung();
    setPatient(null);
    setSuche("");
    setZaehne([]);
    setSeiten({});
    setAusnahme("");
    const erste = artVorlagen[0];
    setGewaehlt(erste ? [erste.termin_typ] : []);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function bestaetigen() {
    if (bestaetigt && dirty) {
      await neueVersion();
      return;
    }
    if (bestaetigt) return;
    if (!patient || module.length === 0 || komposition.fehlt.length > 0) return;
    if (demo) {
      setBestaetigt({ id: "demo", version: 1, am: new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }) });
      setDirty(false);
      setAenderungsgrund("");
      setPushStatus("offen");
      setPushInfo(null);
      return;
    }
    setSendet(true);
    setAktionsFehler(null);
    const res = await fetch("/api/doku/eintrag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: patient.id,
        vorlage_id: module[0].id,
        behandlungsart: art,
        termin_typ: module.map((m) => m.termin_typ).join("+"),
        text: komposition.text,
        zaehne: zaehne.map(String),
        variablen: {
          schienen_von: schienenVon,
          schienen_bis: schienenBis,
          bogen,
          zahn_seiten: seiten,
          leistungen: module.map((m) => m.name),
        },
        auswahl,
        positionen,
        ausnahme_freitext: ausnahme.trim() || null,
        bestaetigen: true,
      }),
    });
    setSendet(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setAktionsFehler(json.error ?? "Eintrag konnte nicht gespeichert werden.");
      return;
    }
    const json = await res.json();
    setBestaetigt({
      id: json.eintrag.id,
      version: json.eintrag.version,
      am: new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }),
    });
    setPushStatus("offen");
    await ladeHeute();
  }

  async function ivorisPush() {
    if (!bestaetigt) return;
    if (demo || bestaetigt.id === "demo") {
      setPushStatus("gepusht");
      setPushInfo("demo");
      return;
    }
    setPushStatus("laeuft");
    setPushInfo(null);
    const res = await fetch(`/api/doku/eintrag/${bestaetigt.id}/ivoris-push`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPushStatus("fehler");
      setPushInfo(json.error ?? "Push fehlgeschlagen.");
      return;
    }
    setPushStatus("gepusht");
    setPushInfo(json.ivoris_entry_id ?? null);
    await ladeHeute();
  }

  async function eigenesPasswortSpeichern() {
    setPwHinweis(null);
    if (pw1.length < 8) { setPwHinweis({ ok: false, text: "Mindestens 8 Zeichen." }); return; }
    if (pw1 !== pw2) { setPwHinweis({ ok: false, text: "Die Passwörter stimmen nicht überein." }); return; }
    setPwLaeuft(true);
    const res = await fetch("/api/konto/passwort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwort: pw1 }),
    });
    const json = await res.json().catch(() => ({}));
    setPwLaeuft(false);
    if (!res.ok) { setPwHinweis({ ok: false, text: json.error ?? "Speichern fehlgeschlagen." }); return; }
    setPw1(""); setPw2("");
    setPwHinweis({ ok: true, text: "Passwort geändert. Gilt ab der nächsten Anmeldung." });
  }

  async function teamLaden() {
    setTeamHinweis(null);
    const res = await fetch("/api/team");
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setTeamHinweis({ ok: false, text: json.error ?? "Team konnte nicht geladen werden." }); return; }
    setTeam(json.mitglieder ?? []);
    if (json.mail_domain) setMailDomain(json.mail_domain);
  }

  async function teamAnlegen() {
    setTeamHinweis(null);
    setTeamLaeuft(true);
    const res = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(neu),
    });
    const json = await res.json().catch(() => ({}));
    setTeamLaeuft(false);
    if (!res.ok) { setTeamHinweis({ ok: false, text: json.error ?? "Anlegen fehlgeschlagen." }); return; }
    setNeu({ name: "", lokal: "", rolle: "verwaltung", kuerzel: "", passwort: "" });
    setTeamHinweis({ ok: true, text: `${json.mitglied.email} angelegt.` });
    await teamLaden();
  }

  async function teamSpeichern(id: string) {
    setTeamHinweis(null);
    setTeamLaeuft(true);
    const res = await fetch(`/api/team/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rolle: editRolle, kuerzel: editKuerzel, scribe_schreiben: editScribe }),
    });
    const json = await res.json().catch(() => ({}));
    setTeamLaeuft(false);
    if (!res.ok) { setTeamHinweis({ ok: false, text: json.error ?? "Speichern fehlgeschlagen." }); return; }
    setEditId(null);
    await teamLaden();
  }

  async function teamPasswortSetzen(id: string) {
    setTeamHinweis(null);
    if (resetPw.length < 8) { setTeamHinweis({ ok: false, text: "Passwort: mindestens 8 Zeichen." }); return; }
    setTeamLaeuft(true);
    const res = await fetch(`/api/team/${id}/passwort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwort: resetPw }),
    });
    const json = await res.json().catch(() => ({}));
    setTeamLaeuft(false);
    if (!res.ok) { setTeamHinweis({ ok: false, text: json.error ?? "Passwort-Reset fehlgeschlagen." }); return; }
    setResetId(null); setResetPw("");
    setTeamHinweis({ ok: true, text: "Passwort gesetzt." });
  }

  async function abmelden() {
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    router.push("/scribe/login");
    router.refresh();
  }

  function leistungsName(terminTyp: string | null, artKey: string | null): string {
    if (!terminTyp) return "";
    const proArt = vorlagen.filter((v) => v.behandlungsart === artKey);
    return terminTyp
      .split("+")
      .map((slug) => proArt.find((v) => v.termin_typ === slug)?.name ?? slug)
      .join(" + ");
  }

  function oeffneDetail(e: TagesEintrag) {
    setDetailFehler(null);
    setDetailLaeuft(false);
    setDetail(e);
  }

  async function detailVerwerfen() {
    if (!detail) return;
    if (!window.confirm("Eintrag wirklich verwerfen? Er verschwindet aus der Tagesliste, bleibt aber in der Historie nachvollziehbar.")) return;
    setDetailLaeuft(true);
    setDetailFehler(null);
    const res = await fetch(`/api/doku/eintrag/${detail.id}/verwerfen`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setDetailLaeuft(false);
    if (!res.ok) {
      setDetailFehler(json.error ?? "Verwerfen fehlgeschlagen.");
      return;
    }
    setDetail(null);
    await ladeHeute();
  }

  async function detailPush() {
    if (!detail) return;
    setDetailLaeuft(true);
    setDetailFehler(null);
    const res = await fetch(`/api/doku/eintrag/${detail.id}/ivoris-push`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setDetailLaeuft(false);
    if (!res.ok) {
      setDetailFehler(json.error ?? "Push fehlgeschlagen.");
      await ladeHeute();
      return;
    }
    setDetail({ ...detail, ivoris_push_status: "gepusht" });
    await ladeHeute();
  }

  function wachePille(e: TagesEintrag): { cls: string; text: string } {
    if (e.status === "entwurf") return { cls: "rot", text: "Doku ausstehend" };
    if (e.ivoris_push_status === "fehler") return { cls: "rot", text: "Push-Fehler" };
    if (e.ivoris_push_status === "gepusht") return { cls: "gruen", text: "✓ in ivoris" };
    return { cls: "bernstein", text: `v${e.version} · noch nicht in ivoris` };
  }

  const heuteDatum = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  const offen = heute.filter((e) => e.status === "entwurf" || e.ivoris_push_status === "fehler").length;

  return (
    <>
      <header className="kopf">
        <span className="wortmarke"><span className="anima">Anima</span> Scribe</span>
        <span className="datum">{heuteDatum}</span>
        <span className="rechts">
          {rolle === "admin" && (
            <button className="thema-toggle" onClick={() => { setTeamOffen(true); setTeamHinweis(null); teamLaden(); }}>Team</button>
          )}
          <button className="thema-toggle" onClick={() => { setPw1(""); setPw2(""); setPwHinweis(null); setPwOffen(true); }}>Passwort</button>
          <button className="thema-toggle" data-an={demo} onClick={() => { setDemo((d) => !d); resetSitzung(); }}>{demo ? "Demo: AN" : "Demo"}</button>
          <button className="thema-toggle" onClick={() => { setSpickSuche(""); setSpickBereich("alle"); setSpickOffen(true); }}>Spickzettel</button>
          <button className="thema-toggle" onClick={wechseln}>
            {thema === "dunkel" ? "☀ Hell" : "● Dunkel"}
          </button>
          <span className="nutzer">{nutzerName}</span>
          <button className="abmelden" onClick={abmelden}>Abmelden</button>
        </span>
      </header>
      {demo && <div className="demo-banner">Demo-Modus · es wird nichts gespeichert, kein Datenbank-Eintrag, kein ivoris</div>}

      <section className="held">
        <p className="augenbraue">Behandlungscockpit</p>
        <h1>Termin vorbei. <span className="glanz">Doku fertig.</span><br />Bevor der Patient an der Tür ist.</h1>
        <p className="einleitung">
          Das System weiß aus dem Behandlungsfall, welcher Termin gerade läuft, und legt den Eintrag fertig vor.
          Bestätigen, Abweichung anklicken, fertig. Die Akte ist sauber, die Abrechnung hat ihre Beweisgrundlage,
          und kein Termin rutscht undokumentiert durch.
        </p>
      </section>

      <main className="buehne">
        {/* ===== Doku-Wache ===== */}
        <p className="abschnitt">Heute · Tagescockpit mit Doku-Wache</p>
        {heute.length === 0 ? (
          <div className="feld"><span className="leer">Noch kein Eintrag heute. Der erste dauert zwanzig Sekunden.</span></div>
        ) : (
          <div className="raster">
            {heute.map((e) => {
              const p = wachePille(e);
              const am = e.bestaetigt_am
                ? new Date(e.bestaetigt_am).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
                : "–";
              return (
                <div className="wache" key={e.id} role="button" tabIndex={0} onClick={() => oeffneDetail(e)} onKeyDown={(ev) => ev.key === "Enter" && oeffneDetail(e)}>
                  <div className="zeit">{am}</div>
                  <div className="wer">{e.patients ? `${e.patients.vorname} ${e.patients.nachname}` : "Unbekannt"}</div>
                  <div className="was">{ART_NAMEN[e.behandlungsart ?? ""] ?? e.behandlungsart} · {leistungsName(e.termin_typ, e.behandlungsart)}</div>
                  <span className={`pille ${p.cls}`}>{p.text}</span>
                </div>
              );
            })}
          </div>
        )}
        <p className="wachenotiz">
          Die Doku-Wache schlägt an, sobald ein Eintrag offen bleibt oder ein Push scheitert:
          <b> rot pulsierend heißt handeln</b>.
          {offen > 0 ? ` Aktuell offen: ${offen}.` : " Aktuell ist alles abgeräumt."}
        </p>

        {/* ===== Patient & Termin ===== */}
        <p className="abschnitt">Termin</p>
        <div className="feld">
          <span className="stufe">Patient</span>
          {patient ? (
            <div className="gewaehlt">
              {patient.name}{patient.alter !== null && <span style={{ color: "var(--gedeckt)", fontWeight: 400 }}>&nbsp;· {patient.alter} J.</span>}
              <button onClick={() => { setPatient(null); setSuche(""); resetSitzung(); }}>wechseln</button>
            </div>
          ) : (
            <>
              <input
                type="text"
                placeholder="Name suchen (mind. 2 Zeichen)"
                value={suche}
                onChange={(e) => setSuche(e.target.value)}
                aria-label="Patient suchen"
              />
              {treffer.length > 0 && (
                <ul className="suchliste">
                  {treffer.map((t) => (
                    <li key={t.id}>
                      <button onClick={() => { setPatient(t); setTreffer([]); resetSitzung(); }}>{t.name}{t.alter !== null && <span style={{ color: "var(--gedeckt)" }}> · {t.alter} J.</span>}</button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <span className="stufe">Behandlungsart</span>
          <div className="wahlzeile">
            {Object.entries(ART_NAMEN).map(([k, n]) => (
              <button key={k} className="wahl" aria-pressed={art === k} onClick={() => artWechseln(k)}>{n}</button>
            ))}
          </div>

          <span className="stufe">Leistungen in dieser Sitzung · stapelbar</span>
          {KOMBIS[art]?.length > 0 && (
            <div className="wahlzeile" style={{ marginBottom: 10 }}>
              {KOMBIS[art].map((kombi) => (
                <button
                  key={kombi.label}
                  className="wahl kombi"
                  aria-pressed={kombi.slugs.every((s) => gewaehlt.includes(s)) && gewaehlt.length === kombi.slugs.length}
                  onClick={() => kombiWaehlen(kombi.slugs)}
                >
                  ⊕ {kombi.label}
                </button>
              ))}
            </div>
          )}
          {PHASEN.map((phase) => {
            const inPhase = sichtbareVorlagen.filter((v) => phase.slugs.includes(v.termin_typ));
            if (inPhase.length === 0) return null;
            return (
              <div key={phase.name}>
                <p className="phase">{phase.name}</p>
                <div className="wahlzeile">
                  {inPhase.map((v) => (
                    <button key={v.id} className="wahl" aria-pressed={gewaehlt.includes(v.termin_typ)} onClick={() => leistungToggle(v.termin_typ)}>
                      {v.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {kontext && <div className="kontext"><b>{ART_NAMEN[art]}:</b> {kontext}</div>}
        </div>

        {/* ===== Eintrag ===== */}
        <p className="abschnitt">Eintrag · vorgelegt vom System, bestätigt von {nutzerName}</p>
        {ladefehler && <div className="feld" style={{ color: "var(--rot)" }}>{ladefehler}</div>}

        <div className="karteikarte">
          <div className="kartenkopf">
            {patient ? patient.name : "Kein Patient gewählt"} · {ART_NAMEN[art]} · {module.map((m) => m.name).join(" + ") || "Keine Leistung gewählt"}
          </div>
          <div className="schreibflaeche">
            {komposition.segs.map((s, i) => (
              <span key={i} className={s.art === "var" ? "seg-var" : s.art === "fehlt" ? "seg-fehlt" : undefined}>
                {s.text}
              </span>
            ))}
            {ausnahme.trim() && <span className="seg-var"> Ausnahme: {ausnahme.trim()}</span>}
          </div>
          <div className="kartenfuss">
            {bestaetigt ? (
              <>
                {dirty ? (
                  <span style={{ color: "var(--gold-textton)", fontWeight: 600 }}>
                    Geändert, wird erst mit neuer Version Teil der Akte
                  </span>
                ) : (
                  <span>Änderungen nur als neue Version, Historie bleibt sichtbar (§ 630f BGB)</span>
                )}
                {!dirty && <span className="stempel">Bestätigt · v{bestaetigt.version} · {bestaetigt.am}</span>}
              </>
            ) : (
              <span>Entwurf. Wird mit Bestätigung Teil der Akte, Aufbewahrung 10 Jahre.</span>
            )}
          </div>
        </div>

        {(brauchtZaehne || brauchtSchienen || brauchtBogen) && (
          <div className="feld" style={{ marginTop: 14 }}>
            {brauchtZaehne && (
              <div className="gruppe">
                <div className="kiefer-titel">Zahnschema · klickbares Kieferbild</div>
                <p className="kiefer-hilfe">Zahn oder Zahl anklicken, beides geht, für die Attachment-Simulation. Das FDI-Raster darunter bleibt synchron.</p>
                <KieferSchema zaehne={zaehne} seiten={seiten} toggle={toggleZahn} />
                <div className="zahnschema">
                  {FDI_OK.map((n) => (
                    <button key={n} className="zahn" aria-pressed={zaehne.includes(n)} data-seite={seiten[n]} onClick={() => toggleZahn(n)}>{n}</button>
                  ))}
                  <div className="zahnluecke" />
                  {FDI_UK.map((n) => (
                    <button key={n} className="zahn" aria-pressed={zaehne.includes(n)} data-seite={seiten[n]} onClick={() => toggleZahn(n)}>{n}</button>
                  ))}
                </div>
              </div>
            )}
            {brauchtSchienen && (
              <div className="gruppe">
                <div className="gname">Schienen-Nr.</div>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--schrift-mono), monospace", fontSize: 13 }}>
                  Nr. <input type="number" min={1} value={schienenVon} onChange={(e) => { bearbeitet(); setSchienenVon(e.target.value); }} aria-label="Schiene von" />
                  – <input type="number" min={1} value={schienenBis} onChange={(e) => { bearbeitet(); setSchienenBis(e.target.value); }} aria-label="Schiene bis" />
                </span>
              </div>
            )}
            {brauchtBogen && (
              <div className="gruppe">
                <div className="gname">Bogen</div>
                <select value={bogen} onChange={(e) => { bearbeitet(); setBogen(e.target.value); }} aria-label="Bogendimension">
                  {BOGEN.map((b) => <option key={b}>{b}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="feld" style={{ marginTop: 14 }}>
          {module.map((m) => (
            <div key={m.id} className="modulblock">
              {Object.entries(m.struktur.groups).map(([g, grp]) => (
                <div className="gruppe" key={`${m.termin_typ}:${g}`}>
                  <div className="gname">
                    {module.length > 1 && <span className="modul">{m.name} · </span>}
                    {grp.label} {grp.req && <span className="pflicht">· Pflicht</span>}
                  </div>
                  <div className="wahlzeile">
                    {grp.opts.map((o, i) => (
                      <button
                        key={i}
                        className="wahl bernstein"
                        aria-pressed={(auswahl[m.termin_typ]?.[g] ?? []).includes(i)}
                        onClick={() => toggleOpt(m.termin_typ, g, i)}
                      >
                        {o.t.replace(/\{zaehne\}|\{von\}|\{bis\}|\{bogen\}/g, "…").replace(/\.$/, "")}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <input
            className="freitext"
            type="text"
            placeholder="Ausnahme (Freitext, optional)"
            value={ausnahme}
            onChange={(e) => { bearbeitet(); setAusnahme(e.target.value); }}
          />
        </div>

        <div className="aktionen">
          {bestaetigt && dirty && (
            <input
              className="freitext"
              style={{ marginTop: 0, maxWidth: 420 }}
              type="text"
              placeholder="Änderungsgrund (Pflicht für neue Version)"
              value={aenderungsgrund}
              onChange={(e) => setAenderungsgrund(e.target.value)}
              aria-label="Änderungsgrund"
            />
          )}
          <button
            className="haupt"
            onClick={bestaetigen}
            disabled={
              sendet ||
              komposition.fehlt.length > 0 ||
              (!!bestaetigt && !dirty) ||
              (!!bestaetigt && dirty && !aenderungsgrund.trim())
            }
          >
            {sendet
              ? "Speichert ..."
              : bestaetigt
                ? dirty
                  ? `Als Version v${bestaetigt.version + 1} bestätigen`
                  : "Eingetragen ✓"
                : "Bestätigen & eintragen"}
          </button>
          {bestaetigt && !dirty && (
            <button className="neben" onClick={ivorisPush} disabled={pushStatus === "laeuft" || pushStatus === "gepusht"}>
              {pushStatus === "laeuft"
                ? "Schreibt in ivoris ..."
                : pushStatus === "gepusht"
                  ? "In ivoris übernommen ✓"
                  : bestaetigt.version > 1
                    ? "Korrektur in ivoris schreiben"
                    : "In ivoris-Akte schreiben"}
            </button>
          )}
          {bestaetigt && !dirty && (
            <button className="neben" onClick={naechsterPatient}>Nächster Patient →</button>
          )}
          {komposition.fehlt.length > 0 && (
            <span className="hinweis-fehlt">Gesperrt, fehlt: {komposition.fehlt.join(", ")}</span>
          )}
          {pushStatus === "gepusht" && pushInfo && <span className="hinweis-ok">{pushInfo === "demo" ? "Demo · kein echter ivoris-Push" : `ivoris-Eintrag ${pushInfo.slice(0, 8)}…`}</span>}
          {pushStatus === "fehler" && pushInfo && <span className="hinweis-fehlt">{pushInfo}</span>}
          {aktionsFehler && <span className="hinweis-fehlt">{aktionsFehler}</span>}
        </div>

        {/* ===== Ausgänge ===== */}
        <p className="abschnitt">Ausgänge · zwei getrennte Artefakte, eine Quelle</p>
        <div className={`ausgaenge${bestaetigt ? " live" : ""}`}>
          <div className="ausgang-spalte">
          <div className="ausgang akte">
            <div className="ohead">
              <span className="otitel">Verlaufsdokumentation → Akte (ivoris)</span>
              <span className="marke">rechtsverbindlich · § 630f BGB</span>
            </div>
            {bestaetigt ? (
              <>
                <div className="aktemeta">
                  {new Date().toLocaleDateString("de-DE")} {bestaetigt.am.split(",")[1] ?? ""} · Pat. {patient?.name} · {ART_NAMEN[art]} · {module.map((m) => m.name).join(" + ")}
                </div>
                <div className="aktetext">{komposition.text}</div>
                <div className="akteversion">
                  Eintrag v{bestaetigt.version} · bestätigt: {nutzerName} · revisionssicher: spätere Änderungen bleiben sichtbar · Aufbewahrung 10 Jahre
                </div>
              </>
            ) : (
              <span className="leer">Erscheint nach Bestätigung als Karteieintrag.</span>
            )}
          </div>
          <span className="signatur">Memory · das Gedächtnis der Behandlung</span>
          </div>
          <div className="ausgang-spalte">
          <div className="ausgang geld">
            <div className="ohead">
              <span className="otitel">{abrechnungTitel}</span>
              <span className="marke">nur Positionen · keine Texte</span>
            </div>
            <div className="geldtabelle">
              <table>
                <tbody>
                  {positionen.map((p, i) => (
                    <tr key={i}>
                      <td className="code">{p.code}{p.anzahl > 1 && <span className="anzahl"> ×{p.anzahl}</span>}</td>
                      <td>{p.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {abrechnungHinweis && (
              <p className="geldnotiz" dangerouslySetInnerHTML={{ __html: abrechnungHinweis }} />
            )}
            <p className="geldnotiz">Positionen sind Vorschläge aus der Vorlage, abrechnungsfachlich zu prüfen. Mit * markierte Zeilen besonders.</p>
          </div>
          <span className="signatur">Cash Cow · ohne Doku kein Geld</span>
          </div>
          {bestaetigt && animaKopplung && (
            <div className="kopplung">
              <span className="kmarke">→ Anima Cura</span>
              <span dangerouslySetInnerHTML={{ __html: animaKopplung }} />
            </div>
          )}
        </div>

      </main>

        {pwOffen && (
          <div className="deckel" onClick={() => setPwOffen(false)}>
            <div className="detailkarte" style={{ maxWidth: 420 }} onClick={(ev) => ev.stopPropagation()}>
              <div className="ohead spalte"><span className="otitel gross">Passwort ändern</span></div>
              <p className="detailmeta" style={{ marginTop: 4 }}>Kein altes Passwort nötig, die Anmeldung ist der Nachweis.</p>
              <PwFeld wert={pw1} setzen={setPw1} platzhalter="Neues Passwort (mind. 8 Zeichen)" label="Neues Passwort" />
              <div style={{ marginTop: 8 }}>
                <PwFeld wert={pw2} setzen={setPw2} platzhalter="Neues Passwort bestätigen" label="Neues Passwort bestätigen" onEnter={eigenesPasswortSpeichern} />
              </div>
              {pwHinweis && <p className={pwHinweis.ok ? "hinweis-ok" : "hinweis-fehlt"} style={{ marginTop: 10 }}>{pwHinweis.text}</p>}
              <div className="aktionen" style={{ marginTop: 14 }}>
                <button className="haupt" onClick={eigenesPasswortSpeichern} disabled={pwLaeuft}>{pwLaeuft ? "Speichert ..." : "Speichern"}</button>
                <button className="neben" onClick={() => setPwOffen(false)}>Schließen</button>
              </div>
            </div>
          </div>
        )}

        {teamOffen && (
          <div className="deckel" onClick={() => setTeamOffen(false)}>
            <div className="detailkarte" style={{ maxWidth: 760 }} onClick={(ev) => ev.stopPropagation()}>
              <div className="ohead spalte">
                <span className="otitel gross">Team &amp; Zugänge</span>
              </div>
              <div className="team-kopfzeile">
                <span>Konto</span><span>K\u00fcrzel</span><span>Rolle</span><span>Passwort &amp; Rechte</span>
              </div>
              {team.map((m) => (
                <div className="team-zeile" key={m.id}>
                  <div className="team-info">
                    <div className="team-name">{m.display_name}</div>
                    <div className="team-mail">{m.email}</div>
                  </div>
                  <span className="team-kuerzelzelle">{m.kuerzel ?? "\u2014"}</span>
                  <span className="team-rolle">
                    <span className={`pille rollen-${m.role}`} style={{ position: "static" }}>{m.role}</span>
                    {m.permissions?.scribe_schreiben === true && m.role === "lesezugriff" && <span className="perm-tag plus">+ Scribe</span>}
                    {m.permissions?.scribe_schreiben === false && m.role !== "lesezugriff" && <span className="perm-tag minus">ohne Scribe</span>}
                  </span>
                  {editId === m.id ? (
                    <span className="team-edit">
                      <select value={editRolle} onChange={(e) => setEditRolle(e.target.value)} aria-label="Rolle">
                        {ROLLEN_INFO.map((r) => <option key={r.wert} value={r.wert}>{r.label}</option>)}
                      </select>
                      <input value={editKuerzel} onChange={(e) => setEditKuerzel(e.target.value)} placeholder="K\u00fcrzel" style={{ width: 70 }} aria-label="K\u00fcrzel" />
                      <label className="perm-schalter">
                        <input type="checkbox" checked={editScribe} onChange={(e) => setEditScribe(e.target.checked)} />
                        Scribe: dokumentieren &amp; ivoris
                      </label>
                      <button className="neben klein" disabled={teamLaeuft} onClick={() => teamSpeichern(m.id)}>OK</button>
                      <button className="neben klein" onClick={() => setEditId(null)}>Abbruch</button>
                    </span>
                  ) : resetId === m.id ? (
                    <span className="team-edit">
                      <PwFeld klein wert={resetPw} setzen={setResetPw} platzhalter="Neues Passwort" label="Neues Passwort" onEnter={() => teamPasswortSetzen(m.id)} />
                      <button className="neben klein" disabled={teamLaeuft} onClick={() => teamPasswortSetzen(m.id)}>OK</button>
                      <button className="neben klein" onClick={() => { setResetId(null); setResetPw(""); }}>Abbruch</button>
                    </span>
                  ) : (
                    <span className="team-edit">
                      <button className="neben klein" onClick={() => { setEditId(m.id); setEditRolle(m.role); setEditKuerzel(m.kuerzel ?? ""); setEditScribe(m.permissions?.scribe_schreiben ?? ["admin", "verwaltung"].includes(m.role)); setResetId(null); }}>Bearbeiten</button>
                      <button className="neben klein" onClick={() => { setResetId(m.id); setResetPw(""); setEditId(null); }}>Passwort</button>
                    </span>
                  )}
                </div>
              ))}

              <p className="spick-bereich" style={{ marginTop: 24 }}>Neues Teammitglied</p>
              <div className="team-form">
                <input value={neu.name} onChange={(e) => setNeu({ ...neu, name: e.target.value })} placeholder="Name, z. B. Dr. Maria Schubert" aria-label="Name" />
                <span className="mail-feld">
                  <input value={neu.lokal} onChange={(e) => setNeu({ ...neu, lokal: e.target.value })} placeholder="vorname" aria-label="E-Mail vor dem @" />
                  <span className="mail-suffix">@{mailDomain}</span>
                </span>
                <select value={neu.rolle} onChange={(e) => setNeu({ ...neu, rolle: e.target.value })} aria-label="Rolle">
                  {ROLLEN_INFO.map((r) => <option key={r.wert} value={r.wert}>{r.label}</option>)}
                </select>
                <input value={neu.kuerzel} onChange={(e) => setNeu({ ...neu, kuerzel: e.target.value })} placeholder="Kürzel, z. B. ms" aria-label="Kürzel" />
                <PwFeld wert={neu.passwort} setzen={(v) => setNeu({ ...neu, passwort: v })} platzhalter="Startpasswort (mind. 8 Zeichen)" label="Startpasswort" />
              </div>
              <p className="detailmeta" style={{ marginTop: 6 }}>{ROLLEN_INFO.find((r) => r.wert === neu.rolle)?.rechte}</p>
              {teamHinweis && <p className={teamHinweis.ok ? "hinweis-ok" : "hinweis-fehlt"} style={{ marginTop: 8 }}>{teamHinweis.text}</p>}
              <div className="aktionen" style={{ marginTop: 12 }}>
                <button className="haupt" disabled={teamLaeuft} onClick={teamAnlegen}>{teamLaeuft ? "Arbeitet ..." : "Anlegen"}</button>
                <button className="neben" onClick={() => setTeamOffen(false)}>Schließen</button>
              </div>
            </div>
          </div>
        )}

        {spickOffen && (
          <div className="deckel" onClick={() => setSpickOffen(false)}>
            <div className="detailkarte" style={{ maxWidth: 760 }} onClick={(ev) => ev.stopPropagation()}>
              <div className="ohead spalte">
                <span className="otitel gross">Spickzettel</span>
                <span className="o-unter">Alles, was man fragen könnte</span>
              </div>
              <input
                type="text"
                placeholder="Suchen, z. B. ivoris, Version, gesperrt ..."
                value={spickSuche}
                onChange={(e) => setSpickSuche(e.target.value)}
                aria-label="Spickzettel durchsuchen"
              />
              <div className="wahlzeile" style={{ marginTop: 12 }}>
                <button className="wahl" aria-pressed={spickBereich === "alle"} onClick={() => setSpickBereich("alle")}>Alles</button>
                {SPICK_BEREICHE.map((b) => (
                  <button key={b} className="wahl" aria-pressed={spickBereich === b} onClick={() => setSpickBereich(b)}>{b}</button>
                ))}
              </div>
              {(() => {
                const q = spickSuche.trim().toLowerCase();
                const passt = (s: (typeof SPICKZETTEL)[number]) =>
                  (!q || s.frage.toLowerCase().includes(q) || s.antwort.toLowerCase().includes(q)) &&
                  (spickBereich === "alle" || s.bereich === spickBereich);
                const sichtbar = SPICKZETTEL.filter(passt);
                if (sichtbar.length === 0) {
                  return <p className="leer" style={{ marginTop: 16 }}>Nichts gefunden. Anders formulieren, oder kurz Juan fragen.</p>;
                }
                return SPICK_BEREICHE.filter((b) => sichtbar.some((s) => s.bereich === b)).map((b) => (
                  <div key={b}>
                    <p className="spick-bereich">{b}</p>
                    {sichtbar.filter((s) => s.bereich === b).map((s) => (
                      <div className="spick-eintrag" key={s.frage}>
                        <div className="spick-frage">{s.frage}</div>
                        <div className="spick-antwort">{s.antwort}</div>
                      </div>
                    ))}
                  </div>
                ));
              })()}
              <button className="neben schliessen" onClick={() => setSpickOffen(false)}>Schließen</button>
            </div>
          </div>
        )}

        {detail && (
          <div className="deckel" onClick={() => setDetail(null)}>
            <div className="detailkarte" onClick={(ev) => ev.stopPropagation()}>
              <div className="ohead">
                <span className="otitel">
                  {detail.patients ? `${detail.patients.vorname} ${detail.patients.nachname}` : "Unbekannt"}
                  {" · "}{ART_NAMEN[detail.behandlungsart ?? ""] ?? detail.behandlungsart}
                </span>
                <span className={`pille ${wachePille(detail).cls}`} style={{ position: "static" }}>{wachePille(detail).text}</span>
              </div>
              <div className="detailmeta">
                {leistungsName(detail.termin_typ, detail.behandlungsart)} · Version {detail.version}
                {detail.bestaetigt_am && ` · bestätigt ${new Date(detail.bestaetigt_am).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`}
                {detail.zaehne?.length > 0 && ` · Zähne: ${detail.zaehne.join(", ")}`}
              </div>
              <div className="detailtext">{detail.text}</div>
              {(detail.positionen ?? []).length > 0 && (
                <div className="geldtabelle">
                  <table>
                    <tbody>
                      {detail.positionen.map((p, i) => (
                        <tr key={i}>
                          <td className="code">{p.code}{(p.anzahl ?? 1) > 1 && <span className="anzahl"> ×{p.anzahl}</span>}</td>
                          <td>{p.text}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="detailmeta" style={{ marginTop: 10 }}>
                Nur Ansicht. Änderungen laufen über den Eintrag selbst als neue Version.
              </p>
              <div className="aktionen" style={{ marginTop: 14 }}>
                {detail.status === "bestaetigt" && detail.ivoris_push_status !== "gepusht" && (
                  <button className="haupt" onClick={detailPush} disabled={detailLaeuft}>
                    {detailLaeuft ? "Schreibt in ivoris ..." : "In ivoris-Akte schreiben"}
                  </button>
                )}
                {detail.ivoris_push_status === "gepusht" && (
                  <span className="hinweis-ok">✓ In ivoris angekommen</span>
                )}
                {detail.ivoris_push_status !== "gepusht" && (
                  <button className="neben verwerfen" disabled={detailLaeuft} onClick={detailVerwerfen}>Verwerfen</button>
                )}
                {detailFehler && <span className="hinweis-fehlt">{detailFehler}</span>}
                <button className="neben" onClick={() => setDetail(null)}>Schließen</button>
              </div>
            </div>
          </div>
        )}

    </>
  );
}
