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

/* Spickzettel: alles, was man fragen koennte. Durchsuchbar. */
const SPICKZETTEL: { frage: string; antwort: string }[] = [
  { frage: "Was macht Anima Scribe?", antwort: "Es legt den Karteieintrag fuer den laufenden Termin fertig vor. Sie bestaetigen, klicken Abweichungen an, fertig. Daraus entstehen zwei Dinge: der Verlaufstext fuer die Akte und die Abrechnungspositionen." },
  { frage: "Was passiert beim Bestaetigen?", antwort: "Der Eintrag wird als Version 1 revisionssicher in Anima gespeichert. Er ist damit Teil der Akte (Aufbewahrung 10 Jahre), aber noch NICHT in ivoris." },
  { frage: "Wann ist der Eintrag in ivoris?", antwort: "Erst nach Klick auf 'In ivoris-Akte schreiben'. Solange zeigt die Tagesliste 'noch nicht in ivoris'. Nachholen geht jederzeit: Patientenkarte in der Tagesliste anklicken, dort steht der Knopf." },
  { frage: "Was bedeuten die Pillen in der Tagesliste?", antwort: "Rot pulsierend: handeln (Doku offen oder Push-Fehler). Bernstein: bestaetigt, aber noch nicht in ivoris. Gruen: in ivoris angekommen." },
  { frage: "Ich habe etwas falsch eingetragen. Wie korrigiere ich?", antwort: "Einfach aendern. Der Knopf wird zu 'Als Version v2 bestaetigen', ein Aenderungsgrund ist Pflicht. Die alte Fassung bleibt sichtbar in der Historie, nichts wird geloescht. In ivoris erscheint die Korrektur als neuer Eintrag mit KORREKTUR-Vermerk." },
  { frage: "Warum kann ich nichts loeschen?", antwort: "Patientenakten sind gesetzlich revisionssicher (Paragraf 630f BGB). Eintraege werden versioniert, nie geloescht. Das schuetzt die Praxis bei Pruefungen und Streitfaellen." },
  { frage: "Was ist die Schnellwahl mit dem Plus, z. B. Erstberatung (Anfangsdiagnostik)?", antwort: "Eine Kombi: zwei Leistungen in einer Sitzung, ein Eintrag. Sie koennen auch selbst stapeln, einfach mehrere Leistungen anklicken." },
  { frage: "Warum ist der Bestaetigen-Knopf gesperrt?", antwort: "Es fehlt etwas Pflichtiges. Daneben steht genau was, z. B. 'Gesperrt, fehlt: Befund, Patient'. Pflichtgruppen sind mit 'Pflicht' markiert." },
  { frage: "Wie setze ich Zaehne?", antwort: "Im Zahnbogen oder im FDI-Raster anklicken, beides ist synchron. Gewaehlte Zaehne bekommen im Bogen ein goldenes Attachment aufgesetzt. Die Zahnliste landet automatisch im Text." },
  { frage: "Warum sehe ich manche Leistungen bei diesem Patienten nicht?", antwort: "Altersregeln. Beispiel: IP-Prophylaxe ist Kassenleistung fuer 6- bis 17-Jaehrige und erscheint nur bei passendem Alter. Das Alter steht am Patienten." },
  { frage: "Was bedeuten die zwei Karten unter Ausgaenge?", antwort: "Ein Eintrag, zwei Artefakte. Links der Verlaufstext fuer die ivoris-Akte (rechtsverbindlich). Rechts die nackten Positionen fuer KZV bzw. Privatliquidation, dort gehen keine Texte hin." },
  { frage: "Hell oder dunkel?", antwort: "Oben rechts umschalten. Die Wahl merkt sich der Browser." },
  { frage: "Sind das dieselben Zugangsdaten wie bei Anima Cura?", antwort: "Ja, ein Konto fuer beides. Abmelden hier beendet auch die Cura-Sitzung in diesem Browser." },
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

/* Visueller Zahnbogen: OK oben, UK unten, Klick setzt den Zahn,
   gewaehlte Zaehne bekommen ein animiert aufgesetztes Attachment (Gold-Raute). */
function ZahnBogen({ zaehne, toggle }: { zaehne: number[]; toggle: (n: number) => void }) {
  const punkte = (fdi: number[], cy: number, unten: boolean) =>
    fdi.map((n, i) => {
      const t = (i + 0.5) / fdi.length;
      const ang = Math.PI * (1 - t);
      const x = 160 + 140 * Math.cos(ang);
      const y = cy + (unten ? 1 : -1) * 80 * Math.sin(ang);
      return { n, x, y };
    });
  const alle = [...punkte(FDI_OK, 97, false), ...punkte(FDI_UK, 115, true)];
  return (
    <svg className="zahnbogen" viewBox="0 0 320 212" aria-label="Zahnbogen, Klick setzt Zahn">
      {alle.map(({ n, x, y }) => {
        const aktiv = zaehne.includes(n);
        return (
          <g key={n} className="zahn-g" onClick={() => toggle(n)}>
            <title>{`Zahn ${n}`}</title>
            <circle cx={x} cy={y} r={9.5} className={aktiv ? "zahnform aktiv" : "zahnform"} />
            <text x={x} y={y + 2.6} className={aktiv ? "zahnnr aktiv" : "zahnnr"}>{n}</text>
            {aktiv && (
              <g transform={`translate(${x + 6.5} ${y - 7})`}>
                <g className="attachment-anim">
                  <rect x={-3.2} y={-3.2} width={6.4} height={6.4} transform="rotate(45)" className="attachment" />
                </g>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function ScribeCockpit({ nutzerName }: { nutzerName: string }) {
  const router = useRouter();
  const { thema, wechseln } = useThema();
  const [detail, setDetail] = useState<TagesEintrag | null>(null);
  const [detailLaeuft, setDetailLaeuft] = useState(false);
  const [detailFehler, setDetailFehler] = useState<string | null>(null);
  const [spickOffen, setSpickOffen] = useState(false);
  const [spickSuche, setSpickSuche] = useState("");
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
  const [schienenVon, setSchienenVon] = useState("9");
  const [schienenBis, setSchienenBis] = useState("11");
  const [bogen, setBogen] = useState(BOGEN[2]);
  const [ausnahme, setAusnahme] = useState("");

  const [sendet, setSendet] = useState(false);
  const [bestaetigt, setBestaetigt] = useState<{ id: string; version: number; am: string } | null>(null);
  const [pushStatus, setPushStatus] = useState<"offen" | "laeuft" | "gepusht" | "fehler">("offen");
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
    setZaehne((alt) => (alt.includes(n) ? alt.filter((x) => x !== n) : [...alt, n].sort((a, b) => a - b)));
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
          out = out.replace(/\{zaehne\}/g, zaehne.join(", "));
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
  }, [module, auswahl, zaehne, schienenVon, schienenBis, bogen, ausnahme, patient]);

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
          <button className="thema-toggle" onClick={() => { setSpickSuche(""); setSpickOffen(true); }}>Spickzettel</button>
          <button className="thema-toggle" onClick={wechseln}>
            {thema === "dunkel" ? "☀ Hell" : "● Dunkel"}
          </button>
          <span className="nutzer">{nutzerName}</span>
          <button className="abmelden" onClick={abmelden}>Abmelden</button>
        </span>
      </header>

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
                <div className="gname">Zahnschema (FDI)</div>
                <ZahnBogen zaehne={zaehne} toggle={toggleZahn} />
                <div className="zahnschema">
                  {FDI_OK.map((n) => (
                    <button key={n} className="zahn" aria-pressed={zaehne.includes(n)} onClick={() => toggleZahn(n)}>{n}</button>
                  ))}
                  <div className="zahnluecke" />
                  {FDI_UK.map((n) => (
                    <button key={n} className="zahn" aria-pressed={zaehne.includes(n)} onClick={() => toggleZahn(n)}>{n}</button>
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
          {pushStatus === "gepusht" && pushInfo && <span className="hinweis-ok">ivoris-Eintrag {pushInfo.slice(0, 8)}…</span>}
          {pushStatus === "fehler" && pushInfo && <span className="hinweis-fehlt">{pushInfo}</span>}
          {aktionsFehler && <span className="hinweis-fehlt">{aktionsFehler}</span>}
        </div>

        {/* ===== Ausgänge ===== */}
        <p className="abschnitt">Ausgänge · zwei getrennte Artefakte, eine Quelle</p>
        <div className={`ausgaenge${bestaetigt ? " live" : ""}`}>
          <div className="ausgang akte">
            <div className="ohead">
              <span className="otitel">Verlaufsdokumentation → Akte (ivoris)<span className="ounter">Memory · das Gedächtnis der Behandlung</span></span>
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
          <div className="ausgang geld">
            <div className="ohead">
              <span className="otitel">{abrechnungTitel}<span className="ounter">Cash Cow · ohne Doku kein Geld</span></span>
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
          {bestaetigt && animaKopplung && (
            <div className="kopplung">
              <span className="kmarke">→ Anima Cura</span>
              <span dangerouslySetInnerHTML={{ __html: animaKopplung }} />
            </div>
          )}
        </div>

        {spickOffen && (
          <div className="deckel" onClick={() => setSpickOffen(false)}>
            <div className="detailkarte" onClick={(ev) => ev.stopPropagation()}>
              <div className="ohead">
                <span className="otitel">Spickzettel</span>
                <span className="detailmeta">Alles, was man fragen könnte</span>
              </div>
              <input
                type="text"
                placeholder="Suchen, z. B. ivoris, Version, gesperrt ..."
                value={spickSuche}
                onChange={(e) => setSpickSuche(e.target.value)}
                aria-label="Spickzettel durchsuchen"
              />
              {SPICKZETTEL.filter((s) => {
                const q = spickSuche.trim().toLowerCase();
                return !q || s.frage.toLowerCase().includes(q) || s.antwort.toLowerCase().includes(q);
              }).map((s) => (
                <div className="spick-eintrag" key={s.frage}>
                  <div className="spick-frage">{s.frage}</div>
                  <div className="spick-antwort">{s.antwort}</div>
                </div>
              ))}
              {SPICKZETTEL.every((s) => {
                const q = spickSuche.trim().toLowerCase();
                return q && !s.frage.toLowerCase().includes(q) && !s.antwort.toLowerCase().includes(q);
              }) && <p className="leer" style={{ marginTop: 14 }}>Nichts gefunden. Anders formulieren, oder kurz Juan fragen.</p>}
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
                {detailFehler && <span className="hinweis-fehlt">{detailFehler}</span>}
                <button className="neben" onClick={() => setDetail(null)}>Schließen</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
