"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/* ===== Typen (Form der doku_vorlagen.struktur / .positionen aus Seed 019b) ===== */
type Opt = { t: string; on?: boolean };
type Gruppe = { label: string; req: boolean; type: "single" | "multi"; opts: Opt[] };
type TemplateSeg = string | { g: string };
type Struktur = {
  template: TemplateSeg[];
  groups: Record<string, Gruppe>;
  vars: string[];
  kontext?: string;
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
type PatientTreffer = { id: string; name: string };
type TagesEintrag = {
  id: string;
  status: string;
  version: number;
  termin_typ: string | null;
  behandlungsart: string | null;
  ivoris_push_status: string;
  patients: { vorname: string; nachname: string } | null;
};

const ART_NAMEN: Record<string, string> = { aligner: "Aligner", multiband: "Multiband", removable: "Herausnehmbar" };
const BOGEN = ["12er NiTi", "14er NiTi", "16er NiTi", "16×22 NiTi", "16×22 Stahl", "18er Stahl"];
const FDI_OK = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_UK = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

export default function ScribeCockpit({ nutzerName }: { nutzerName: string }) {
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [heute, setHeute] = useState<TagesEintrag[]>([]);

  const [suche, setSuche] = useState("");
  const [treffer, setTreffer] = useState<PatientTreffer[]>([]);
  const [patient, setPatient] = useState<PatientTreffer | null>(null);

  const [art, setArt] = useState<string>("aligner");
  const [vorlageId, setVorlageId] = useState<string | null>(null);

  const [auswahl, setAuswahl] = useState<Record<string, number[]>>({});
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
      const erste = liste.find((v) => v.behandlungsart === "aligner");
      if (erste) setVorlageId(erste.id);
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
        setTreffer((json.results ?? []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name })));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [suche, patient]);

  const vorlage = useMemo(() => vorlagen.find((v) => v.id === vorlageId) ?? null, [vorlagen, vorlageId]);
  const artVorlagen = useMemo(
    () => vorlagen.filter((v) => v.behandlungsart === art).sort((a, b) => a.sort_index - b.sort_index),
    [vorlagen, art]
  );

  /* Beim Vorlagenwechsel: Defaults setzen, Ergebniszustand zuruecksetzen */
  useEffect(() => {
    if (!vorlage) return;
    const start: Record<string, number[]> = {};
    Object.entries(vorlage.struktur.groups).forEach(([g, grp]) => {
      start[g] = grp.opts.flatMap((o, i) => (o.on ? [i] : []));
    });
    setAuswahl(start);
    setZaehne([]);
    setAusnahme("");
    setBestaetigt(null);
    setPushStatus("offen");
    setPushInfo(null);
    setAktionsFehler(null);
  }, [vorlage]);

  function toggleOpt(g: string, i: number) {
    if (!vorlage) return;
    setBestaetigt(null);
    const grp = vorlage.struktur.groups[g];
    setAuswahl((alt) => {
      const akt = alt[g] ?? [];
      if (grp.type === "single") return { ...alt, [g]: akt.includes(i) ? [] : [i] };
      return { ...alt, [g]: akt.includes(i) ? akt.filter((x) => x !== i) : [...akt, i].sort((a, b) => a - b) };
    });
  }

  function toggleZahn(n: number) {
    setBestaetigt(null);
    setZaehne((alt) => (alt.includes(n) ? alt.filter((x) => x !== n) : [...alt, n].sort((a, b) => a - b)));
  }

  /* Text zusammensetzen */
  type Seg = { art: "fix" | "var" | "fehlt"; text: string };
  const komposition = useMemo(() => {
    const segs: Seg[] = [];
    const fehlt: string[] = [];
    if (!vorlage) return { segs, fehlt, text: "" };

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

    vorlage.struktur.template.forEach((seg) => {
      if (typeof seg === "string") {
        segs.push({ art: "fix", text: seg });
        return;
      }
      const grp = vorlage.struktur.groups[seg.g];
      const sel = auswahl[seg.g] ?? [];
      if (sel.length === 0) {
        if (grp?.req) {
          fehlt.push(grp.label);
          segs.push({ art: "fehlt", text: `[ ${grp.label} fehlt ]` });
        }
        return;
      }
      sel.forEach((i) => segs.push({ art: "var", text: fuellen(grp.opts[i].t) + " " }));
    });

    if (!patient) fehlt.push("Patient");

    let text = segs.map((s) => (s.art === "fehlt" ? "" : s.text)).join("");
    if (ausnahme.trim()) text += ` Ausnahme: ${ausnahme.trim()}`;
    return { segs, fehlt: Array.from(new Set(fehlt)), text: text.trim() };
  }, [vorlage, auswahl, zaehne, schienenVon, schienenBis, bogen, ausnahme, patient]);

  /* Positionen aufloesen */
  const positionen = useMemo(() => {
    if (!vorlage) return [] as { code: string; text: string; anzahl: number }[];
    return vorlage.positionen
      .filter((r) => !r.if || (auswahl[r.if.g] ?? []).includes(r.if.i))
      .map((r) => ({ code: r.code, text: r.text, anzahl: r.count === "zaehne" ? Math.max(1, zaehne.length) : 1 }));
  }, [vorlage, auswahl, zaehne]);

  async function bestaetigen() {
    if (!vorlage || !patient || komposition.fehlt.length > 0) return;
    setSendet(true);
    setAktionsFehler(null);
    const res = await fetch("/api/doku/eintrag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_id: patient.id,
        vorlage_id: vorlage.id,
        behandlungsart: vorlage.behandlungsart,
        termin_typ: vorlage.termin_typ,
        text: komposition.text,
        zaehne: zaehne.map(String),
        variablen: { schienen_von: schienenVon, schienen_bis: schienenBis, bogen },
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

  const brauchtZaehne = vorlage?.struktur.vars.includes("zaehne");
  const brauchtSchienen = vorlage?.struktur.vars.includes("schienen");
  const brauchtBogen = vorlage?.struktur.vars.includes("bogen");
  const heuteDatum = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <>
      <header className="kopf">
        <span className="wortmarke" style={{ fontFamily: "var(--schrift-display), serif" }}>
          <span className="anima">Anima</span> Scribe
        </span>
        <span className="datum">{heuteDatum}</span>
        <span className="nutzer">{nutzerName}</span>
      </header>

      <main className="buehne">
        {/* ===== Linke Spalte ===== */}
        <div>
          <p className="etikett">Patient</p>
          <div className="feld">
            {patient ? (
              <div className="gewaehlt">
                {patient.name}
                <button onClick={() => { setPatient(null); setSuche(""); setBestaetigt(null); }}>wechseln</button>
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
                        <button onClick={() => { setPatient(t); setTreffer([]); }}>{t.name}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <p className="etikett">Termin</p>
          <div className="feld">
            <div className="wahlzeile" style={{ marginBottom: 12 }}>
              {Object.entries(ART_NAMEN).map(([k, n]) => (
                <button
                  key={k}
                  className="wahl"
                  aria-pressed={art === k}
                  onClick={() => {
                    setArt(k);
                    const erste = vorlagen.filter((v) => v.behandlungsart === k).sort((a, b) => a.sort_index - b.sort_index)[0];
                    setVorlageId(erste ? erste.id : null);
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="wahlzeile">
              {artVorlagen.map((v) => (
                <button key={v.id} className="wahl" aria-pressed={v.id === vorlageId} onClick={() => setVorlageId(v.id)}>
                  {v.name}
                </button>
              ))}
            </div>
          </div>

          <p className="etikett">Heute dokumentiert</p>
          <div className="feld">
            {heute.length === 0 ? (
              <p className="leer">Noch kein Eintrag heute. Der erste dauert zwanzig Sekunden.</p>
            ) : (
              <ul className="tagesliste">
                {heute.map((e) => (
                  <li key={e.id}>
                    <span className="wer">
                      {e.patients ? `${e.patients.vorname} ${e.patients.nachname}` : "Unbekannt"}
                    </span>
                    <span className="was">{ART_NAMEN[e.behandlungsart ?? ""] ?? e.behandlungsart} · {e.termin_typ}</span>
                    <span className={`pille ${e.ivoris_push_status === "gepusht" ? "blau" : e.ivoris_push_status === "fehler" ? "rot" : "grau"}`} style={{ marginLeft: "auto" }}>
                      {e.ivoris_push_status === "gepusht" ? "in ivoris" : e.ivoris_push_status === "fehler" ? "Push-Fehler" : `v${e.version} bestätigt`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* ===== Karteikarte ===== */}
        <div>
          <p className="etikett">Eintrag · vom System vorgelegt, von Ihnen bestätigt</p>

          {ladefehler && <div className="feld" style={{ color: "var(--siegel)" }}>{ladefehler}</div>}

          {vorlage && (
            <>
              <div className="karteikarte">
                <div className="kartenkopf">
                  {patient ? patient.name : "Kein Patient gewählt"} · {ART_NAMEN[vorlage.behandlungsart]} · {vorlage.name}
                </div>
                <div className="schreibflaeche">
                  {komposition.segs.map((s, i) => (
                    <span key={i} className={s.art === "fix" ? "seg-fix" : s.art === "var" ? "seg-var" : "seg-fehlt"}>
                      {s.text}
                    </span>
                  ))}
                  {ausnahme.trim() && <span className="seg-var"> Ausnahme: {ausnahme.trim()}</span>}
                </div>
                <div className="kartenfuss">
                  {bestaetigt ? (
                    <>
                      <span className="stempel">Bestätigt · v{bestaetigt.version} · {bestaetigt.am}</span>
                      <span>Änderungen nur als neue Version, Historie bleibt sichtbar (§ 630f BGB)</span>
                    </>
                  ) : (
                    <span>Entwurf. Wird mit Bestätigung Teil der Akte, Aufbewahrung 10 Jahre.</span>
                  )}
                </div>
              </div>

              {(brauchtZaehne || brauchtSchienen || brauchtBogen) && (
                <div className="feld" style={{ marginTop: 18 }}>
                  {brauchtZaehne && (
                    <div className="gruppe" style={{ marginTop: 0 }}>
                      <div className="gname">Zahnschema (FDI)</div>
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
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        Nr. <input type="number" min={1} value={schienenVon} onChange={(e) => { setBestaetigt(null); setSchienenVon(e.target.value); }} aria-label="Schiene von" />
                        – <input type="number" min={1} value={schienenBis} onChange={(e) => { setBestaetigt(null); setSchienenBis(e.target.value); }} aria-label="Schiene bis" />
                      </span>
                    </div>
                  )}
                  {brauchtBogen && (
                    <div className="gruppe">
                      <div className="gname">Bogen</div>
                      <select value={bogen} onChange={(e) => { setBestaetigt(null); setBogen(e.target.value); }} aria-label="Bogendimension">
                        {BOGEN.map((b) => <option key={b}>{b}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div className="feld" style={{ marginTop: 18 }}>
                {Object.entries(vorlage.struktur.groups).map(([g, grp]) => (
                  <div className="gruppe" key={g} style={{ marginTop: g === Object.keys(vorlage.struktur.groups)[0] ? 0 : 14 }}>
                    <div className="gname">
                      {grp.label} {grp.req && <span className="pflicht">· Pflicht</span>}
                    </div>
                    <div className="wahlzeile">
                      {grp.opts.map((o, i) => (
                        <button key={i} className="wahl" aria-pressed={(auswahl[g] ?? []).includes(i)} onClick={() => toggleOpt(g, i)}>
                          {o.t.replace(/\{zaehne\}|\{von\}|\{bis\}|\{bogen\}/g, "…").replace(/\.$/, "")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <input
                  className="freitext"
                  type="text"
                  placeholder="Ausnahme (Freitext, optional)"
                  value={ausnahme}
                  onChange={(e) => { setBestaetigt(null); setAusnahme(e.target.value); }}
                />
              </div>

              <div className="aktionen">
                <button className="haupt" onClick={bestaetigen} disabled={sendet || komposition.fehlt.length > 0 || !!bestaetigt}>
                  {sendet ? "Speichert ..." : bestaetigt ? "Eingetragen" : "Bestätigen & eintragen"}
                </button>
                {bestaetigt && (
                  <button className="neben" onClick={ivorisPush} disabled={pushStatus === "laeuft" || pushStatus === "gepusht"}>
                    {pushStatus === "laeuft" ? "Schreibt in ivoris ..." : pushStatus === "gepusht" ? "In ivoris übernommen" : "In ivoris-Akte schreiben"}
                  </button>
                )}
                {komposition.fehlt.length > 0 && (
                  <span className="hinweis-fehlt">Gesperrt — fehlt: {komposition.fehlt.join(", ")}</span>
                )}
                {pushStatus === "gepusht" && pushInfo && <span className="hinweis-ok">ivoris-Eintrag {pushInfo.slice(0, 8)}…</span>}
                {pushStatus === "fehler" && pushInfo && <span className="hinweis-fehlt">{pushInfo}</span>}
                {aktionsFehler && <span className="hinweis-fehlt">{aktionsFehler}</span>}
              </div>

              <div className="positionen" style={{ fontFamily: "var(--schrift-mono), monospace" }}>
                <p className="etikett" style={{ marginBottom: 8 }}>{vorlage.struktur.abrechnung_titel ?? "Abrechnung"} · nur Positionen, keine Texte</p>
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
                <p className="fussnote" style={{ fontFamily: "var(--schrift-text), sans-serif" }}>
                  Positionen sind Vorschläge aus der Vorlage und abrechnungsfachlich zu prüfen. Mit * markierte Zeilen besonders.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
