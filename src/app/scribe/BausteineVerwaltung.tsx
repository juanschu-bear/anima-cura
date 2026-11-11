"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { aendereVorlage, ladeVerlauf, NEU_LADEN, type BausteinAktion, type BuchAktion, type Pruefung, type VorlagenAenderung, type VorlagenVerlauf } from "./bausteine-api";

/** Form einer Vorlage aus /api/doku/vorlagen?history=1, soweit die Verwaltung sie braucht. */
export type VerwaltungsOpt = { t: string; optionKey?: string; origin?: "vorlage" | "praxis"; hidden?: boolean; lastChangeId?: string | null; editable?: boolean; requiresConfirmation?: boolean };
export type VerwaltungsVorlage = {
  id: string;
  name: string;
  struktur: { groups: Record<string, { label: string; explizit?: boolean; opts: VerwaltungsOpt[] }> };
  positionen: Array<{ code?: string; text?: string; if?: { g: string; i?: number } }>;
};

const PLATZHALTER = /\{zaehne\}|\{von\}|\{bis\}|\{bogen\}/g;
const lesbar = (text: string) => text.replace(PLATZHALTER, "…");
const zeit = (iso: string) => {
  const d = new Date(iso);
  const datum = d.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
  const uhr = d.toLocaleTimeString("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" });
  return `${datum}, ${uhr}`;
};
/** Wert für ein datetime-local-Feld in Berliner Zeit. */
const lokalerWert = (d: Date) => {
  const teile = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
  return teile.replace(" ", "T");
};

function geschuetzt(v: VerwaltungsVorlage, g: string): boolean {
  return !!v.struktur.groups[g]?.explizit || v.positionen.some((regel) => regel.if?.g === g);
}

const AKTION_TEXT: Record<BuchAktion, string> = {
  add: "scribe.blocks.log.add",
  reconcile: "scribe.blocks.log.reconcile",
  hide: "scribe.blocks.log.hide",
  show: "scribe.blocks.log.show",
  rename: "scribe.blocks.log.rename",
  restore_practice: "scribe.blocks.log.restorePractice",
  undo: "scribe.blocks.log.undo",
  restore_at: "scribe.blocks.log.restoreAt",
};

type Meldung = { art: "ok" | "fehler" | "schutz"; text: string; umbenennenStatt?: { key: string; text: string } };
type Eingabe = { action: BausteinAktion; optionKey?: string; text?: string; changeId?: string; at?: string };
/** Wartet auf die zweite Bestätigung der Praxis: dieselbe Änderung, dazu der Fingerabdruck der gezeigten Auswirkungen. */
type Offen = { key: string; eingabe: Eingabe; erfolg: string; review: Pruefung };

/**
 * Bausteine einer Leistung selbst verwalten: umbenennen, ausblenden, wieder einblenden, gelöschte eigene Texte
 * zurückholen. Jede Änderung steht im Änderungsbuch und lässt sich rückgängig machen. Hängt an einer Gruppe die
 * Abrechnung, zeigt Scribe vorher die betroffenen Positionen und die Praxis bestätigt ein zweites Mal (Juans Regel:
 * die Praxis entscheidet selbst). Mit einem älteren Server ohne zweite Bestätigung bleiben diese Gruppen gesperrt.
 */
export default function BausteineVerwaltung({
  vorlage,
  titel,
  startGruppe,
  onClose,
  onGeaendert,
  onWunsch,
}: {
  vorlage: VerwaltungsVorlage;
  titel: string;
  startGruppe: string | null;
  onClose: () => void;
  onGeaendert: () => Promise<void>;
  onWunsch: (text: string) => void;
}) {
  const gruppen = Object.keys(vorlage.struktur.groups);
  const [tab, setTab] = useState<"bausteine" | "buch">("bausteine");
  const [gruppe, setGruppe] = useState<string>(startGruppe && vorlage.struktur.groups[startGruppe] ? startGruppe : gruppen[0] ?? "");
  const [verlauf, setVerlauf] = useState<VorlagenVerlauf | null>(null);
  const [aeltere, setAeltere] = useState<VorlagenAenderung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [umbenennen, setUmbenennen] = useState<{ key: string; text: string; vorher: string } | null>(null);
  const [zeitpunkt, setZeitpunkt] = useState("");
  const [zurueckdrehenFragen, setZurueckdrehenFragen] = useState(false);
  const [geloeschtSuche, setGeloeschtSuche] = useState("");
  const [offen, setOffen] = useState<Offen | null>(null);
  const frageRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (offen) frageRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [offen]);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      setVerlauf(await ladeVerlauf(vorlage.id));
      setAeltere([]);
    } catch (e) {
      setMeldung({ art: "fehler", text: (e as Error).message || t("scribe.workspace.unavailable") });
    } finally {
      setLaedt(false);
    }
  }, [vorlage.id]);

  useEffect(() => {
    void laden();
  }, [laden]);

  useEffect(() => {
    const taste = (ev: KeyboardEvent) => ev.key === "Escape" && onClose();
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [onClose]);

  const grp = vorlage.struktur.groups[gruppe];
  /** Der Server kennt die zweite Bestätigung, wenn er je Baustein requiresConfirmation mitschickt. */
  const zweiteBestaetigung = useMemo(
    () => Object.values(vorlage.struktur.groups).some((g) => g.opts.some((o) => typeof o.requiresConfirmation === "boolean")),
    [vorlage],
  );
  const gesperrt = !zweiteBestaetigung && geschuetzt(vorlage, gruppe);
  const mitAbrechnung = zweiteBestaetigung && geschuetzt(vorlage, gruppe);
  const optsMitIndex = useMemo(() => (grp?.opts ?? []).map((o, i) => ({ o, i })), [grp]);
  const angeboten = optsMitIndex.filter(({ o }) => !o.hidden);
  const ausgeblendet = optsMitIndex.filter(({ o }) => o.hidden);
  /** Je Baustein die letzte Änderung: nur sie lässt sich einzeln rückgängig machen. */
  const letzteAenderung = useMemo(() => {
    const ids = new Set<string>();
    Object.values(vorlage.struktur.groups).forEach((g) => g.opts.forEach((o) => o.lastChangeId && ids.add(o.lastChangeId)));
    return ids;
  }, [vorlage]);
  const geloescht = useMemo(() => {
    const suche = geloeschtSuche.trim().toLowerCase();
    return (verlauf?.deletedPracticeOptions ?? [])
      .filter((d) => !suche || d.state.text.toLowerCase().includes(suche) || (vorlage.struktur.groups[d.gruppe]?.label ?? "").toLowerCase().includes(suche))
      .sort((a, b) => a.gruppe.localeCompare(b.gruppe) || a.option_index - b.option_index);
  }, [verlauf, geloeschtSuche, vorlage]);
  const eintraege = useMemo(() => [...(verlauf?.changes ?? []), ...aeltere], [verlauf, aeltere]);

  async function ausfuehren(key: string, eingabe: Eingabe, erfolg: string, bestaetigt?: Pruefung) {
    if (!verlauf || beschaeftigt) return;
    setBeschaeftigt(key);
    setMeldung(null);
    const ergebnis = await aendereVorlage({
      templateId: vorlage.id,
      expectedRevision: verlauf.revision,
      ...eingabe,
      ...(bestaetigt ? { confirmProtected: true, confirmationFingerprint: bestaetigt.fingerprint } : {}),
    });
    if (ergebnis.ok) {
      setOffen(null);
      setUmbenennen(null);
      setZurueckdrehenFragen(false);
      await onGeaendert();
      await laden();
      setMeldung({ art: "ok", text: erfolg });
    } else if (ergebnis.code === "template_change_confirmation_required" && ergebnis.review) {
      // Erst die Auswirkungen zeigen, dann entscheidet die Praxis. Hat sich inzwischen etwas geändert, zeigt Scribe den neuen Stand.
      setOffen({ key, eingabe, erfolg, review: ergebnis.review });
    } else if (ergebnis.code === "template_change_not_possible" && ergebnis.review?.impossible) {
      setOffen(null);
      const vorschlag = ergebnis.review.impossible.suggestion;
      setMeldung({
        art: "fehler",
        text: t("scribe.blocks.lastRequired"),
        ...(vorschlag?.kind === "rename_instead" ? { umbenennenStatt: { key: vorschlag.optionKey, text: vorschlag.currentText } } : {}),
      });
    } else if (ergebnis.code === "template_group_protected") {
      setMeldung({ art: "schutz", text: t("scribe.blocks.protected") });
    } else if (NEU_LADEN.has(ergebnis.code)) {
      await onGeaendert();
      await laden();
      setMeldung({ art: "fehler", text: t("scribe.blocks.stale") });
    } else if (ergebnis.code === "history_time_unavailable") {
      setMeldung({ art: "fehler", text: t("scribe.blocks.timeUnavailable", "de", { zeit: verlauf.historyAvailableFrom ? zeit(verlauf.historyAvailableFrom) : "—" }) });
    } else if (ergebnis.code === "netz_weg") {
      setMeldung({ art: "fehler", text: t("scribe.blocks.network") });
    } else {
      setMeldung({ art: "fehler", text: ergebnis.message || t("scribe.workspace.unavailable") });
    }
    setBeschaeftigt(null);
  }

  async function aeltereLaden() {
    const vor = aeltere.length ? aeltere[aeltere.length - 1].seq : verlauf?.changes[verlauf.changes.length - 1]?.seq;
    if (!vor) return;
    try {
      const mehr = await ladeVerlauf(vorlage.id, vor);
      setAeltere((alt) => [...alt, ...mehr.changes]);
      setVerlauf((v) => (v ? { ...v, nextBeforeSeq: mehr.nextBeforeSeq } : v));
    } catch (e) {
      setMeldung({ art: "fehler", text: (e as Error).message || t("scribe.workspace.unavailable") });
    }
  }

  function umbenennenSpeichern() {
    if (!umbenennen) return;
    const text = umbenennen.text.trim();
    if (!text || text.length > 400) {
      setMeldung({ art: "fehler", text: t("scribe.blocks.renameInvalid") });
      return;
    }
    if (text === umbenennen.vorher) {
      setUmbenennen(null);
      return;
    }
    void ausfuehren(`rename:${umbenennen.key}`, { action: "rename", optionKey: umbenennen.key, text }, t("scribe.blocks.done.rename"));
  }

  const wunschText = t("scribe.blocks.wishText", "de", { leistung: titel, gruppe: grp?.label ?? gruppe });
  const platzhalterFehlt = !!umbenennen && /\{zaehne\}|\{von\}|\{bis\}|\{bogen\}/.test(umbenennen.vorher) && !/\{zaehne\}|\{von\}|\{bis\}|\{bogen\}/.test(umbenennen.text);
  const minZeit = verlauf?.historyAvailableFrom ? lokalerWert(new Date(verlauf.historyAvailableFrom)) : undefined;

  return (
    <div className="deckel" onClick={onClose}>
      <div className="detailkarte bausteine-karte" role="dialog" aria-modal="true" aria-labelledby="bausteine-titel" onClick={(ev) => ev.stopPropagation()}>
        <div className="ohead spalte">
          <span className="o-unter">{t("scribe.blocks.eyebrow")}</span>
          <span className="otitel gross" id="bausteine-titel">{titel}</span>
        </div>
        <p className="bausteine-erklaerung">{t("scribe.blocks.intro")}</p>

        <div className="bausteine-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "bausteine"} onClick={() => setTab("bausteine")}>{t("scribe.blocks.tab.blocks")}</button>
          <button type="button" role="tab" aria-selected={tab === "buch"} onClick={() => setTab("buch")}>{t("scribe.blocks.tab.book")}</button>
        </div>

        {meldung && (
          <div className={`bausteine-meldung ${meldung.art}`} role={meldung.art === "ok" ? "status" : "alert"}>
            <span>{meldung.text}</span>
            {meldung.art === "schutz" && (
              <button type="button" className="neben klein" onClick={() => onWunsch(wunschText)}>{t("scribe.blocks.wish")}</button>
            )}
            {meldung.umbenennenStatt && (
              <button
                type="button"
                className="neben klein"
                onClick={() => {
                  const ziel = meldung.umbenennenStatt!;
                  const gruppeDesZiels = Object.keys(vorlage.struktur.groups).find((g) => vorlage.struktur.groups[g].opts.some((o) => o.optionKey === ziel.key));
                  if (gruppeDesZiels) setGruppe(gruppeDesZiels);
                  setTab("bausteine");
                  setUmbenennen({ key: ziel.key, text: ziel.text, vorher: ziel.text });
                  setMeldung(null);
                }}
              >
                {t("scribe.blocks.renameInstead")}
              </button>
            )}
          </div>
        )}

        {offen && (
          <div className="bausteine-frage bausteine-bestaetigen" role="alertdialog" aria-labelledby="bestaetigen-titel" ref={frageRef}>
            <b id="bestaetigen-titel">{t("scribe.blocks.confirmTitle")}</b>
            <span>{t("scribe.blocks.confirmIntro")}</span>
            <ul className="bausteine-auswirkungen">
              {offen.review.impacts.map((wirkung) => {
                const index = vorlage.struktur.groups[wirkung.group]?.opts.findIndex((o) => o.optionKey === wirkung.optionKey) ?? -1;
                const positionen = wirkung.positions.filter((p) => p.optionIndex === null || index < 0 || p.optionIndex === index);
                const umbenannt = wirkung.previous.text !== wirkung.proposed.text;
                const aus = !wirkung.previous.hidden && wirkung.proposed.hidden;
                const ein = wirkung.previous.hidden && !wirkung.proposed.hidden;
                const art = aus ? "Hide" : ein ? "Show" : "Rename";
                return (
                  <li key={wirkung.optionKey}>
                    <span className="auswirkung-was">
                      <small>{vorlage.struktur.groups[wirkung.group]?.label ?? wirkung.group}</small>
                      {umbenannt
                        ? t("scribe.blocks.confirmRename", "de", { vorher: lesbar(wirkung.previous.text) || "—", nachher: lesbar(wirkung.proposed.text) })
                        : aus
                          ? t("scribe.blocks.confirmHide", "de", { text: lesbar(wirkung.previous.text) })
                          : t("scribe.blocks.confirmShow", "de", { text: lesbar(wirkung.proposed.text) })}
                    </span>
                    {positionen.length > 0 ? (
                      <>
                        <span className="auswirkung-hinweis">{t(`scribe.blocks.confirmPositions${art}`)}</span>
                        <span className="auswirkung-positionen">
                          {positionen.map((p) => (
                            <span key={p.ruleIndex} className="auswirkung-position"><b>{p.code ?? "—"}</b>{p.text ? ` ${p.text}` : ""}</span>
                          ))}
                        </span>
                      </>
                    ) : (
                      <span className="auswirkung-hinweis">{t("scribe.blocks.confirmNoPositions")}</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <span className="bausteine-hinweis">{t("scribe.blocks.confirmName")}</span>
            <div className="baustein-knoepfe">
              <button type="button" className="haupt klein" disabled={!!beschaeftigt} onClick={() => void ausfuehren(offen.key, offen.eingabe, offen.erfolg, offen.review)}>
                {beschaeftigt ? "…" : t("scribe.blocks.confirmYes")}
              </button>
              <button type="button" className="neben klein" disabled={!!beschaeftigt} onClick={() => setOffen(null)}>{t("scribe.blocks.cancel")}</button>
            </div>
          </div>
        )}

        {tab === "bausteine" && (
          <>
            {gruppen.length > 1 && (
              <div className="bausteine-gruppen" aria-label={t("scribe.blocks.groups")}>
                {gruppen.map((g) => (
                  <button key={g} type="button" aria-pressed={g === gruppe} onClick={() => { setGruppe(g); setUmbenennen(null); }}>
                    {vorlage.struktur.groups[g].label}
                    {geschuetzt(vorlage, g) && <span className="bausteine-schloss" aria-label={t(zweiteBestaetigung ? "scribe.blocks.billingShort" : "scribe.blocks.lockedShort")} title={t(zweiteBestaetigung ? "scribe.blocks.billingShort" : "scribe.blocks.lockedShort")}>●</span>}
                  </button>
                ))}
              </div>
            )}

            {mitAbrechnung && (
              <div className="bausteine-schutz abrechnung">
                <b>{t("scribe.blocks.billingTitle")}</b>
                <span>{t("scribe.blocks.billingText")}</span>
              </div>
            )}

            {gesperrt && (
              <div className="bausteine-schutz">
                <b>{t("scribe.blocks.lockedTitle")}</b>
                <span>{t("scribe.blocks.lockedText")}</span>
                <button type="button" className="neben klein" onClick={() => onWunsch(wunschText)}>{t("scribe.blocks.wish")}</button>
              </div>
            )}

            <h4 className="bausteine-h">{t("scribe.blocks.offered", "de", { n: angeboten.length })}</h4>
            {angeboten.length === 0 ? (
              <p className="bausteine-leer">{t("scribe.blocks.noneOffered")}</p>
            ) : (
              <ul className="bausteine-liste">
                {angeboten.map(({ o, i }) => {
                  const key = o.optionKey ?? `i${i}`;
                  const bearbeitbar = !!o.optionKey && o.editable !== false && !gesperrt;
                  const edit = umbenennen && umbenennen.key === o.optionKey ? umbenennen : null;
                  return (
                    <li key={key} className="baustein-zeile">
                      {edit ? (
                        <div className="baustein-umbenennen">
                          <input
                            autoFocus
                            value={edit.text}
                            maxLength={400}
                            aria-label={t("scribe.blocks.renameAria")}
                            onChange={(e) => setUmbenennen({ ...edit, text: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") umbenennenSpeichern(); if (e.key === "Escape") setUmbenennen(null); }}
                          />
                          {platzhalterFehlt && <p className="bausteine-hinweis">{t("scribe.blocks.placeholderGone")}</p>}
                          <div className="baustein-knoepfe">
                            <button type="button" className="haupt klein" disabled={!!beschaeftigt} onClick={umbenennenSpeichern}>{t("scribe.blocks.save")}</button>
                            <button type="button" className="neben klein" onClick={() => setUmbenennen(null)}>{t("scribe.blocks.cancel")}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="baustein-text">
                            {lesbar(o.t)}
                            <small>{o.origin === "praxis" ? t("scribe.blocks.ownText") : t("scribe.blocks.templateText")}</small>
                          </span>
                          {bearbeitbar && (
                            <span className="baustein-knoepfe">
                              <button type="button" className="neben klein" disabled={!!beschaeftigt} onClick={() => setUmbenennen({ key: o.optionKey!, text: o.t, vorher: o.t })}>{t("scribe.blocks.rename")}</button>
                              <button type="button" className="neben klein" disabled={!!beschaeftigt} onClick={() => void ausfuehren(`hide:${key}`, { action: "hide", optionKey: o.optionKey }, t("scribe.blocks.done.hide"))}>
                                {beschaeftigt === `hide:${key}` ? "…" : t("scribe.blocks.hide")}
                              </button>
                            </span>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {ausgeblendet.length > 0 && (
              <details className="bausteine-aus" open={ausgeblendet.length <= 6}>
                <summary>{t("scribe.blocks.hidden", "de", { n: ausgeblendet.length })}</summary>
                <ul className="bausteine-liste">
                  {ausgeblendet.map(({ o, i }) => {
                    const key = o.optionKey ?? `i${i}`;
                    return (
                      <li key={key} className="baustein-zeile aus">
                        <span className="baustein-text">
                          {lesbar(o.t)}
                          <small>{o.origin === "praxis" ? t("scribe.blocks.ownText") : t("scribe.blocks.templateText")}</small>
                        </span>
                        {o.optionKey && (
                          <span className="baustein-knoepfe">
                            <button type="button" className="neben klein" disabled={!!beschaeftigt} onClick={() => void ausfuehren(`show:${key}`, { action: "show", optionKey: o.optionKey }, t("scribe.blocks.done.show"))}>
                              {beschaeftigt === `show:${key}` ? "…" : t("scribe.blocks.show")}
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </>
        )}

        {tab === "buch" && (
          <>
            {laedt && !verlauf ? (
              <p className="bausteine-leer" role="status">{t("scribe.blocks.loading")}</p>
            ) : (
              <>
                <h4 className="bausteine-h">{t("scribe.blocks.bookTitle")}</h4>
                {eintraege.length === 0 ? (
                  <p className="bausteine-leer">{t("scribe.blocks.bookEmpty")}</p>
                ) : (
                  <ol className="bausteine-buch">
                    {eintraege.map((c) => {
                      const umbenannt = c.before_state.text !== c.after_state.text;
                      const sichtbarWechsel = c.before_state.hidden !== c.after_state.hidden;
                      return (
                        <li key={c.id}>
                          <span className="buch-zeit">{zeit(c.created_at)}</span>
                          <span className="buch-text">
                            <span className="buch-titel"><b>{t(AKTION_TEXT[c.action] ?? "scribe.blocks.log.change")}</b> · {vorlage.struktur.groups[c.gruppe]?.label ?? c.gruppe}</span>
                            <span className="buch-was">
                              {umbenannt ? <>„{lesbar(c.before_state.text)}“ → „{lesbar(c.after_state.text)}“</> : <>„{lesbar(c.after_state.text)}“</>}
                              {sichtbarWechsel && <em>{c.after_state.hidden ? t("scribe.blocks.nowHidden") : t("scribe.blocks.nowShown")}</em>}
                            </span>
                            <small>
                              {t("scribe.blocks.by", "de", { name: c.actor_name })}
                              {c.confirmation?.kind === "practice_second_confirmation" && <> · {t("scribe.blocks.confirmedBadge")}</>}
                              {c.confirmation?.kind === "automatic_safe_reconciliation" && <> · {t("scribe.blocks.systemBadge")}</>}
                            </small>
                          </span>
                          {letzteAenderung.has(c.id) && (
                            <button type="button" className="neben klein" disabled={!!beschaeftigt} onClick={() => void ausfuehren(`undo:${c.id}`, { action: "undo", changeId: c.id }, t("scribe.blocks.done.undo"))}>
                              {beschaeftigt === `undo:${c.id}` ? "…" : t("scribe.blocks.undo")}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
                {verlauf?.nextBeforeSeq && (
                  <button type="button" className="neben klein" onClick={() => void aeltereLaden()}>{t("scribe.blocks.older")}</button>
                )}

                <div className="bausteine-zeitpunkt">
                  <h4 className="bausteine-h">{t("scribe.blocks.restoreTitle")}</h4>
                  <p className="bausteine-erklaerung">{t("scribe.blocks.restoreText")}</p>
                  <div className="baustein-knoepfe">
                    <input
                      type="datetime-local"
                      value={zeitpunkt}
                      min={minZeit}
                      max={lokalerWert(new Date())}
                      aria-label={t("scribe.blocks.restoreAria")}
                      onChange={(e) => { setZeitpunkt(e.target.value); setZurueckdrehenFragen(false); }}
                    />
                    <button type="button" className="neben klein" disabled={!zeitpunkt || !!beschaeftigt} onClick={() => setZurueckdrehenFragen(true)}>{t("scribe.blocks.restoreGo")}</button>
                  </div>
                  {verlauf?.historyAvailableFrom && <p className="bausteine-hinweis">{t("scribe.blocks.restoreFrom", "de", { zeit: zeit(verlauf.historyAvailableFrom) })}</p>}
                  {zurueckdrehenFragen && zeitpunkt && (
                    <div className="bausteine-frage" role="alertdialog" aria-label={t("scribe.blocks.restoreTitle")}>
                      <span>{t("scribe.blocks.restoreConfirm", "de", { leistung: titel, zeit: zeit(new Date(zeitpunkt).toISOString()) })}</span>
                      <div className="baustein-knoepfe">
                        <button type="button" className="haupt klein" disabled={!!beschaeftigt} onClick={() => void ausfuehren("restore_at", { action: "restore_at", at: new Date(zeitpunkt).toISOString() }, t("scribe.blocks.done.restoreAt"))}>
                          {t("scribe.blocks.restoreYes")}
                        </button>
                        <button type="button" className="neben klein" onClick={() => setZurueckdrehenFragen(false)}>{t("scribe.blocks.cancel")}</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="bausteine-geloescht">
                  <h4 className="bausteine-h">{t("scribe.blocks.deletedTitle", "de", { n: verlauf?.deletedPracticeOptions.length ?? 0 })}</h4>
                  <p className="bausteine-erklaerung">{t("scribe.blocks.deletedText")}</p>
                  {(verlauf?.deletedPracticeOptions.length ?? 0) > 6 && (
                    <input type="text" className="bausteine-suche" placeholder={t("scribe.blocks.deletedSearch")} value={geloeschtSuche} onChange={(e) => setGeloeschtSuche(e.target.value)} aria-label={t("scribe.blocks.deletedSearch")} />
                  )}
                  {geloescht.length === 0 ? (
                    <p className="bausteine-leer">{t("scribe.blocks.deletedNone")}</p>
                  ) : (
                    <ul className="bausteine-liste">
                      {geloescht.slice(0, 60).map((d) => (
                        <li key={d.option_key} className="baustein-zeile aus">
                          <span className="baustein-text">
                            {lesbar(d.state.text)}
                            <small>{vorlage.struktur.groups[d.gruppe]?.label ?? d.gruppe}</small>
                          </span>
                          <span className="baustein-knoepfe">
                            <button type="button" className="neben klein" disabled={!!beschaeftigt} onClick={() => void ausfuehren(`restore:${d.option_key}`, { action: "restore_practice", optionKey: d.option_key }, t("scribe.blocks.done.restorePractice"))}>
                              {beschaeftigt === `restore:${d.option_key}` ? "…" : t("scribe.blocks.restorePractice")}
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {geloescht.length > 60 && <p className="bausteine-hinweis">{t("scribe.blocks.deletedMore", "de", { n: geloescht.length - 60 })}</p>}
                </div>
              </>
            )}
          </>
        )}

        <div className="aktionen" style={{ marginTop: 16 }}>
          <button type="button" className="neben" onClick={onClose}>{t("scribe.blocks.close")}</button>
        </div>
      </div>
    </div>
  );
}

