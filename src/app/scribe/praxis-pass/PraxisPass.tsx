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
  eigen?: boolean;
};

type Antwort = {
  behandlungsart: string;
  termin_typ: string;
  verlaufstext?: string | null;
  optionen_text?: string | null;
  optionen_final?: Record<string, string[]> | null;
  zusatzschritte?: Record<string, string> | null;
  kig_text?: string | null;
  bema_text?: string | null;
  goz_text?: string | null;
  abrechnung_anm?: string | null;
  status?: string;
};

const ART_NAME: Record<string, string> = {
  aligner: "Aligner",
  multiband: "Multiband (feste Spange)",
  removable: "Removable (herausnehmbar)",
};
const ART_REIHE = ["aligner", "multiband", "removable"];
const VAR_NAME: Record<string, string> = { zaehne: "Zahnangabe (FDI)", schienen: "Schienen-Nummer", bogen: "Bogen-Stärke" };

function schluessel(b: string, t: string) { return `${b}::${t}`; }

export default function PraxisPass({ nutzerName, token }: { nutzerName: string; token?: string }) {
  const [vorlagen, setVorlagen] = useState<Vorlage[]>([]);
  const [antworten, setAntworten] = useState<Record<string, Antwort>>({});
  const [ladend, setLadend] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [speichertK, setSpeichertK] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<{ ok: boolean; text: string } | null>(null);
  const [absendet, setAbsendet] = useState(false);
  const [eigene, setEigene] = useState<Vorlage[]>([]);
  const [neuArt, setNeuArt] = useState<string | null>(null); // welche Behandlungsart gerade ein Eingabefeld zeigt
  const [neuName, setNeuName] = useState("");
  const [optEntwurf, setOptEntwurf] = useState<Record<string, string>>({}); // key: gid::gruppe -> aktueller Eingabetext

  const apiUrl = useCallback((pfad: string) => (token ? `${pfad}${pfad.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : pfad), [token]);
  const apiHeaders = useCallback((): HeadersInit => (token ? { "Content-Type": "application/json", "x-praxis-pass-token": token } : { "Content-Type": "application/json" }), [token]);

  const laden = useCallback(async () => {
    setLadend(true); setFehler(null);
    try {
      const [rv, ra] = await Promise.all([fetch(apiUrl("/api/doku/vorlagen")), fetch(apiUrl("/api/praxis-pass"))]);
      const jv = await rv.json(); const ja = await ra.json();
      if (!rv.ok) throw new Error(jv.error ?? "Vorlagen konnten nicht geladen werden.");
      if (!ra.ok) throw new Error(ja.error ?? "Antworten konnten nicht geladen werden.");
      setVorlagen(jv.vorlagen ?? []);
      const map: Record<string, Antwort> = {};
      const eigeneAusDb: Vorlage[] = [];
      (ja.antworten ?? []).forEach((a: Antwort & { eigener_name?: string | null }) => {
        map[schluessel(a.behandlungsart, a.termin_typ)] = a;
        if (a.eigener_name) {
          eigeneAusDb.push({ id: `eigen-${a.behandlungsart}-${a.termin_typ}`, behandlungsart: a.behandlungsart as Vorlage["behandlungsart"],
            termin_typ: a.termin_typ, name: a.eigener_name, sort_index: 999, struktur: {}, eigen: true });
        }
      });
      setEigene(eigeneAusDb);
      setAntworten(map);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : "Fehler beim Laden.");
    } finally { setLadend(false); }
  }, [apiUrl]);
  useEffect(() => { laden(); }, [laden]);

  const sortiert = useMemo(() => {
    const grp: Record<string, Vorlage[]> = { aligner: [], multiband: [], removable: [] };
    [...vorlagen].sort((a, b) => a.sort_index - b.sort_index).forEach((v) => grp[v.behandlungsart]?.push(v));
    eigene.forEach((v) => grp[v.behandlungsart]?.push(v));
    return grp;
  }, [vorlagen, eigene]);

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

  // Aktuelle Optionsliste einer Gruppe: gespeicherte Bearbeitung, sonst die Vorlage-Platzhalter als Start.
  function optListe(v: Vorlage, gk: string, vorgabe: string[]): string[] {
    const a = feld(schluessel(v.behandlungsart, v.termin_typ));
    const f = a.optionen_final ?? {};
    return f[gk] ?? vorgabe;
  }
  function setOptListe(v: Vorlage, gk: string, neu: string[]) {
    const a = feld(schluessel(v.behandlungsart, v.termin_typ));
    setFeld(v, { optionen_final: { ...(a.optionen_final ?? {}), [gk]: neu } });
  }
  function optHinzu(v: Vorlage, gk: string, vorgabe: string[]) {
    const ek = `${schluessel(v.behandlungsart, v.termin_typ)}::${gk}`;
    const text = (optEntwurf[ek] ?? "").trim();
    if (!text) return;
    const aktuell = optListe(v, gk, vorgabe);
    setOptListe(v, gk, [...aktuell, text]);
    setOptEntwurf((alt) => ({ ...alt, [ek]: "" }));
  }
  function optWeg(v: Vorlage, gk: string, vorgabe: string[], idx: number) {
    const aktuell = optListe(v, gk, vorgabe);
    setOptListe(v, gk, aktuell.filter((_, i) => i !== idx));
  }

  async function speichern(v: Vorlage) {
    const k = schluessel(v.behandlungsart, v.termin_typ);
    setSpeichertK(k); setHinweis(null);
    const a = feld(k);
    const res = await fetch(apiUrl("/api/praxis-pass"), {
      method: "POST", headers: apiHeaders(),
      body: JSON.stringify({ ...a, behandlungsart: v.behandlungsart, termin_typ: v.termin_typ, eigener_name: v.eigen ? v.name : null }),
    });
    const json = await res.json().catch(() => ({}));
    setSpeichertK(null);
    if (!res.ok) { setHinweis({ ok: false, text: json.error ?? "Speichern fehlgeschlagen." }); return; }
    setAntworten((alt) => ({ ...alt, [k]: { ...feld(k), status: "gespeichert" } }));
    setOffen(null);
    setHinweis({ ok: true, text: `${v.name} gespeichert.` });
  }

  function eigeneAnlegen(art: string) {
    const name = neuName.trim();
    if (!name) return;
    const slug = `eigen-${Date.now().toString(36)}`;
    const v: Vorlage = { id: `eigen-${art}-${slug}`, behandlungsart: art as Vorlage["behandlungsart"],
      termin_typ: slug, name, sort_index: 999, struktur: {}, eigen: true };
    setEigene((alt) => [...alt, v]);
    setNeuName(""); setNeuArt(null); setOffen(schluessel(v.behandlungsart, v.termin_typ));
  }

  async function allesAbsenden() {
    setAbsendet(true); setHinweis(null);
    const res = await fetch(apiUrl("/api/praxis-pass"), {
      method: "POST", headers: apiHeaders(), body: JSON.stringify({ absenden: true }),
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
        <div className="pp-eyebrow">Anima Scribe ist fertig</div>
        <h1>Jetzt bekommt es euren Ton.</h1>
        <p className="pp-deal">
          Investiert jetzt einmal rund 30 Minuten. Dafür schreibt sich eure Doku ab dem nächsten Termin in Sekunden,
          in eurem Ton.
        </p>
        <p className="pp-lede">
          Scribe ist gebaut, aber noch neutral. Unten seht ihr pro Termin-Art, was Scribe schon vorschlägt. Ihr
          streicht, korrigiert und ergänzt, bis es klingt wie ihr. Ihr könnt jederzeit speichern und später weitermachen.
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

                    <label className="pp-feldlabel">1. So soll der Eintrag in der Patientenakte aussehen</label>
                    <p className="pp-feldhint">Der Text, den ihr nach so einem Termin in die Karte schreiben würdet. Das Beispiel im Feld könnt ihr überschreiben.</p>
                    <textarea className="pp-textarea" rows={3} value={a.verlaufstext ?? ""}
                      onChange={(e) => setFeld(v, { verlaufstext: e.target.value })}
                      placeholder="z. B. Routinekontrolle, Sitz und Tracking unauffällig, nächste Schienen ausgegeben." />

                    {v.eigen ? (
                      <>
                        <label className="pp-feldlabel">2. Welche Auswahl-Punkte gehören dazu?</label>
                        <p className="pp-feldhint">Diese Termin-Art ist neu. Tippe jeden Befund oder Auswahlpunkt ein und drücke Enter. Jeder Punkt erscheint als Eintrag.</p>
                        {(() => {
                          const gk = "punkte";
                          const liste = optListe(v, gk, []);
                          const ek = `${k}::${gk}`;
                          return (
                            <div className="pp-chipbox">
                              {liste.map((opt, i) => (
                                <span className="pp-chip" key={i}>{opt}<button type="button" className="pp-chip-x" onClick={() => optWeg(v, gk, [], i)} aria-label="entfernen">×</button></span>
                              ))}
                              <input className="pp-chip-input" value={optEntwurf[ek] ?? ""}
                                onChange={(e) => setOptEntwurf((alt) => ({ ...alt, [ek]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); optHinzu(v, gk, []); } }}
                                placeholder="Punkt eintippen, Enter" />
                            </div>
                          );
                        })()}
                      </>
                    ) : (
                      <>
                        <label className="pp-feldlabel">2. Die Auswahl-Optionen prüfen</label>
                        <p className="pp-feldhint">Diese Punkte legt Scribe aktuell vor (Platzhalter). Streiche mit dem × was nicht stimmt, und tippe eigene Punkte ein, Enter fügt sie hinzu.</p>
                        {Object.entries(groups).map(([gk, g]) => {
                          const vorgabe = (g.opts ?? []).map((o) => o.t);
                          const liste = optListe(v, gk, vorgabe);
                          const ek = `${k}::${gk}`;
                          return (
                            <div className="pp-gruppe" key={gk}>
                              <div className="pp-gruppe-kopf">
                                <span className="pp-gruppe-label">{g.label}</span>
                                <span className={`pp-pflicht ${g.req ? "ja" : "nein"}`}>{g.req ? "Pflicht" : "optional"}</span>
                                <span className="pp-gruppe-typ">{g.type === "multi" ? "Mehrfach" : "Einfach"}</span>
                              </div>
                              <div className="pp-chipbox">
                                {liste.map((opt, i) => (
                                  <span className="pp-chip" key={i}>{opt}<button type="button" className="pp-chip-x" onClick={() => optWeg(v, gk, vorgabe, i)} aria-label="entfernen">×</button></span>
                                ))}
                                {liste.length === 0 && <span className="pp-chip-leer">noch keine Punkte</span>}
                                <input className="pp-chip-input" value={optEntwurf[ek] ?? ""}
                                  onChange={(e) => setOptEntwurf((alt) => ({ ...alt, [ek]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); optHinzu(v, gk, vorgabe); } }}
                                  placeholder="Punkt eintippen, Enter" />
                              </div>
                            </div>
                          );
                        })}
                      </>
                    )}

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
                    <p className="pp-feldhint">{v.struktur?.kontext ? `Bisher notiert: ${v.struktur.kontext}. Bitte die echten Positionen eintragen.` : "Hier bitte die passenden Abrechnungspositionen eintragen."}</p>
                    <div className="pp-zweispalt">
                      <input className="pp-input" value={a.bema_text ?? ""} onChange={(e) => setFeld(v, { bema_text: e.target.value })} placeholder="BEMA-Positionen" />
                      <input className="pp-input" value={a.goz_text ?? ""} onChange={(e) => setFeld(v, { goz_text: e.target.value })} placeholder="GOZ-Positionen" />
                    </div>
                    <input className="pp-input" value={a.abrechnung_anm ?? ""} onChange={(e) => setFeld(v, { abrechnung_anm: e.target.value })} placeholder="Anmerkung zur Abrechnung (optional)" />

                    <div className="pp-aktionen">
                      <button className="pp-speichern" disabled={speichertK === k} onClick={() => speichern(v)}>
                        {speichertK === k ? "Speichert …" : "Speichern"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          {neuArt === art ? (
            <div className="pp-neu">
              <input className="pp-input" autoFocus value={neuName} onChange={(e) => setNeuName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && eigeneAnlegen(art)}
                placeholder="Name der Termin-Art, z. B. Zwischenkontrolle" />
              <div className="pp-neu-aktionen">
                <button className="pp-speichern" onClick={() => eigeneAnlegen(art)}>Hinzufügen</button>
                <button className="pp-abbruch" onClick={() => { setNeuArt(null); setNeuName(""); }}>Abbrechen</button>
              </div>
            </div>
          ) : (
            <button className="pp-neu-knopf" onClick={() => { setNeuArt(art); setNeuName(""); }}>
              + Termin-Art fehlt? Hinzufügen
            </button>
          )}
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
