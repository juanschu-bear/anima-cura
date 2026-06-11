"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Opt = { t: string; on?: boolean };
type Group = { label: string; req?: boolean; type?: string; opts?: Opt[] };
type Vorlage = {
  id: string;
  behandlungsart: "aligner" | "multiband" | "removable";
  termin_typ: string;
  name: string;
  sort_index: number;
  struktur: { groups?: Record<string, Group>; vars?: string[]; kontext?: string };
};

type Antwort = {
  behandlungsart: string;
  termin_typ: string;
  verlaufstext?: string | null;
  optionen_text?: string | null;
  zusatzschritte?: Record<string, string> | null;
  kig_text?: string | null;
  bema_text?: string | null;
  goz_text?: string | null;
  abrechnung_anm?: string | null;
  status?: string;
};

const ART_NAME: Record<string, string> = {
  aligner: "Aligner (Clear Aligner)",
  multiband: "Multiband (feste Spange)",
  removable: "Removable (herausnehmbar)",
};
const ART_REIHE = ["aligner", "multiband", "removable"];
const VAR_NAME: Record<string, string> = { zaehne: "Zahnangabe (FDI)", schienen: "Schienen-Nummer", bogen: "Bogen-Stärke" };

function schluessel(b: string, t: string) { return `${b}::${t}`; }

export default function PraxisPass({ nutzerName }: { nutzerName: string }) {
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [antworten, setAntworten] = useState<Record<string, Antwort>>({});
  const [ladend, setLadend] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [speichertK, setSpeichertK] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<{ ok: boolean; text: string } | null>(null);
  const [absendet, setAbsendet] = useState(false);

  const laden = useCallback(async () => {
    setLadend(true); setFehler(null);
    try {
      const [rv, ra] = await Promise.all([fetch("/api/doku/vorlagen"), fetch("/api/praxis-pass")]);
      const jv = await rv.json(); const ja = await ra.json();
      if (!rv.ok) throw new Error(jv.error ?? "Vorlagen konnten nicht geladen werden.");
      if (!ra.ok) throw new Error(ja.error ?? "Antworten konnten nicht geladen werden.");
      setVorlagen(jv.vorlagen ?? []);
      const map: Record<string, Antwort> = {};
      (ja.antworten ?? []).forEach((a: Antwort) => { map[schluessel(a.behandlungsart, a.termin_typ)] = a; });
      setAntworten(map);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Fehler beim Laden.");
    } finally { setLadend(false); }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const sortiert = useMemo(() => {
    const grp: Record<string, Vorlage[]> = { aligner: [], multiband: [], removable: [] };
    [...vorlagen].sort((a, b) => a.sort_index - b.sort_index).forEach((v) => grp[v.behandlungsart]?.push(v));
    return grp;
  }, [vorlagen]);

  function istErledigt(k: string) {
    const a = antworten[k];
    return !!a && (((a.verlaufstext ?? "").trim().length > 0) || a.status === "gespeichert" || a.status === "abgesendet");
  }

  const erledigt = useMemo(
    () => vorlagen.filter((v) => istErledigt(schluessel(v.behandlungsart, v.termin_typ))).length,
    [vorlagen, antworten] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const gesamt = vorlagen.length;

  function feld(k: string): Antwort {
    return antworten[k] ?? { behandlungsart: "", termin_typ: "" };
  }
  function setFeld(v: Vorlage, patch: Partial<Antwort>) {
    const k = schluessel(v.behandlungsart, v.termin_typ);
    setAntworten((alt) => ({
      ...alt,
      [k]: { ...(alt[k] ?? { behandlungsart: v.behandlungsart, termin_typ: v.termin_typ }), behandlungsart: v.behandlungsart, termin_typ: v.termin_typ, ...patch },
    }));
  }

  async function speichern(v: Vorlage) {
    const k = schluessel(v.behandlungsart, v.termin_typ);
    setSpeichertK(k); setHinweis(null);
    const a = feld(k);
    const res = await fetch("/api/praxis-pass", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...a, behandlungsart: v.behandlungsart, termin_typ: v.termin_typ }),
    });
    const json = await res.json().catch(() => ({}));
    setSpeichertK(null);
    if (!res.ok) { setHinweis({ ok: false, text: json.error ?? "Speichern fehlgeschlagen." }); return; }
    setAntworten((alt) => ({ ...alt, [k]: { ...feld(k), status: "gespeichert" } }));
    setHinweis({ ok: true, text: `${v.name} gespeichert.` });
  }

  async function allesAbsenden() {
    setAbsendet(true); setHinweis(null);
    const res = await fetch("/api/praxis-pass", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ absenden: true }),
    });
    const json = await res.json().catch(() => ({}));
    setAbsendet(false);
    if (!res.ok) { setHinweis({ ok: false, text: json.error ?? "Absenden fehlgeschlagen." }); return; }
    setHinweis({ ok: true, text: "Alles abgesendet. Vielen Dank, der Fachinhalt ist bei uns." });
    laden();
  }

  return (
    <main className="pp-wrap">
      <header className="pp-kopf">
        <div className="pp-marke">ANIMA SCRIBE</div>
        <h1>Praxis-Pass: euer Fachinhalt</h1>
        <p className="pp-lede">
          Das hier ist schon gebaut. Pro Termin-Art seht ihr, was Anima Scribe aktuell vorlegt.
          Ergänzt euren echten Verlaufstext, prüft die Optionen und sendet am Ende alles ab.
          Einmalig, danach legt Scribe eure eigenen Texte vor.
        </p>
        <div className="pp-fortschritt">
          <div className="pp-balken"><span style={{ width: gesamt ? `${(erledigt / gesamt) * 100}%` : "0%" }} /></div>
          <span className="pp-zaehler">{erledigt} von {gesamt} ausgefüllt</span>
        </div>
      </header>

      {hinweis && <div className={`pp-hinweis ${hinweis.ok ? "ok" : "fehler"}`}>{hinweis.text}</div>}
      {fehler && <div className="pp-hinweis fehler">{fehler}</div>}
      {ladend && <div className="pp-laden">Lade Vorlagen …</div>}

      {!ladend && ART_REIHE.map((art) => (
        <section className="pp-art" key={art}>
          <h2>{ART_NAME[art]}</h2>
          {sortiert[art]?.map((v) => {
            const k = schluessel(v.behandlungsart, v.termin_typ);
            const a = feld(k);
            const groups = v.struktur?.groups ?? {};
            const vars = v.struktur?.vars ?? [];
            const kigRelevant = art === "multiband" && ["erstuntersuchung", "diagnostik"].includes(v.termin_typ);
            const zs = a.zusatzschritte ?? {};
            const auf = offen === k;
            return (
              <article className={`pp-karte ${istErledigt(k) ? "fertig" : ""}`} key={v.id}>
                <button className="pp-kartenkopf" onClick={() => setOffen(auf ? null : k)} aria-expanded={auf}>
                  <span className="pp-status-punkt" aria-hidden="true" />
                  <span className="pp-kartentitel">{v.name}</span>
                  {a.status === "abgesendet" && <span className="pp-tag abgesendet">abgesendet</span>}
                  {a.status === "gespeichert" && <span className="pp-tag gespeichert">gespeichert</span>}
                  <span className="pp-chevron">{auf ? "▾" : "▸"}</span>
                </button>

                {auf && (
                  <div className="pp-koerper">
                    {vars.length > 0 && (
                      <p className="pp-varhint">Dieses Formular fragt zusätzlich ab: {vars.map((x) => VAR_NAME[x] ?? x).join(", ")}.</p>
                    )}

                    <label className="pp-feldlabel">1. Verlaufstext, wie er in der Akte stehen soll</label>
                    <p className="pp-feldhint">Der Satz, den du selbst diktieren würdest. Frei schreiben, wir gießen ihn in die Vorlage.</p>
                    <textarea className="pp-textarea" rows={3} value={a.verlaufstext ?? ""}
                      onChange={(e) => setFeld(v, { verlaufstext: e.target.value })}
                      placeholder="z. B. Routinekontrolle, Sitz und Tracking unauffällig, nächste Schienen ausgegeben." />

                    <label className="pp-feldlabel">2. Das legt Scribe aktuell vor</label>
                    <p className="pp-feldhint">Platzhalter aus dem Aufbau. Was fehlt oder anders ist, einfach unten ergänzen.</p>
                    <div className="pp-istand">
                      {Object.entries(groups).map(([gk, g]) => (
                        <div className="pp-gruppe" key={gk}>
                          <div className="pp-gruppe-kopf">
                            <span className="pp-gruppe-label">{g.label}</span>
                            <span className={`pp-pflicht ${g.req ? "ja" : "nein"}`}>{g.req ? "Pflicht" : "optional"}</span>
                            <span className="pp-gruppe-typ">{g.type === "multi" ? "Mehrfach" : "Einfach"}</span>
                          </div>
                          <ul className="pp-optliste">
                            {(g.opts ?? []).map((o, i) => <li key={i}>{o.t}</li>)}
                            {(g.opts ?? []).length === 0 && <li className="pp-leer">keine Optionen hinterlegt</li>}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <textarea className="pp-textarea" rows={2} value={a.optionen_text ?? ""}
                      onChange={(e) => setFeld(v, { optionen_text: e.target.value })}
                      placeholder="Ergänzungen oder Korrekturen zu den Optionen oben." />

                    <label className="pp-feldlabel">3. Feste Zusatzschritte zu diesem Termin</label>
                    <div className="pp-schritte">
                      {[["scan", "3D-Scan"], ["roentgen", "Röntgen / OPG"], ["foto", "Foto-Status"]].map(([key, label]) => (
                        <div className="pp-schritt" key={key}>
                          <span className="pp-schritt-label">{label}</span>
                          <div className="pp-segwahl">
                            {["nein", "optional", "pflicht"].map((w) => (
                              <button key={w} type="button"
                                className={`pp-seg ${zs[key] === w ? "an" : ""}`}
                                onClick={() => setFeld(v, { zusatzschritte: { ...zs, [key]: w } })}>
                                {w === "nein" ? "nein" : w === "optional" ? "optional" : "Pflicht"}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      <input className="pp-input" value={zs.weitere ?? ""}
                        onChange={(e) => setFeld(v, { zusatzschritte: { ...zs, weitere: e.target.value } })}
                        placeholder="Weitere feste Schritte (optional)" />
                    </div>

                    {kigRelevant && (
                      <>
                        <label className="pp-feldlabel">4. KIG-Einstufung</label>
                        <p className="pp-feldhint">Recherche ergab die Bezeichnung über 3 oder unter 3. Formulierung bestätigen oder korrigieren.</p>
                        <textarea className="pp-textarea" rows={2} value={a.kig_text ?? ""}
                          onChange={(e) => setFeld(v, { kig_text: e.target.value })}
                          placeholder="z. B. KIG voraussichtlich über 3, Unterlagen veranlasst." />
                      </>
                    )}

                    <label className="pp-feldlabel">{kigRelevant ? "5." : "4."} Abrechnung (für Frau Rüger)</label>
                    {v.struktur?.kontext && <p className="pp-feldhint">Aktuell hinterlegt: {v.struktur.kontext}</p>}
                    <div className="pp-zweispalt">
                      <input className="pp-input" value={a.bema_text ?? ""} onChange={(e) => setFeld(v, { bema_text: e.target.value })} placeholder="BEMA-Positionen" />
                      <input className="pp-input" value={a.goz_text ?? ""} onChange={(e) => setFeld(v, { goz_text: e.target.value })} placeholder="GOZ-Positionen" />
                    </div>
                    <input className="pp-input" value={a.abrechnung_anm ?? ""} onChange={(e) => setFeld(v, { abrechnung_anm: e.target.value })} placeholder="Anmerkung zur Abrechnung (optional)" />

                    <div className="pp-aktionen">
                      <button className="pp-speichern" disabled={speichertK === k} onClick={() => speichern(v)}>
                        {speichertK === k ? "Speichert …" : "Diese Art speichern"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      ))}

      {!ladend && (
        <footer className="pp-fuss">
          <p>Wenn alles passt, sende den gesamten Praxis-Pass ab. Du kannst vorher jede Art einzeln speichern und später weitermachen.</p>
          <button className="pp-absenden" disabled={absendet || erledigt === 0} onClick={allesAbsenden}>
            {absendet ? "Sende …" : "Praxis-Pass absenden"}
          </button>
        </footer>
      )}
    </main>
  );
}
