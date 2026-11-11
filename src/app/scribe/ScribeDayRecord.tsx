"use client";

import { useEffect, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { scribeFetch } from "./verbindung";

/*
 * Tagesdatensatz im Scribe-Cockpit (Vertrag: anima-leitstand/docs/2026-11-05-tagesdatensatz-klaerfaelle.md).
 * Ein Patient hat je Behandlungstag einen Eintrag. Wer später am selben Tag dokumentiert, schreibt auf derselben
 * Karteikarte weiter: als Nachtrag oder als Korrektur eines Teils. Nach IVORIS geht nur der neue Teil.
 * Positionskonflikte blockieren nie die Dokumentation, sie gehen als Klärfall an die Abrechnung.
 * Die Darstellung nutzt die Bausteine des Cockpits: Karteikarte, Wahl-Pillen, Wache-Karten und Ausgänge.
 */

export type DayPosition = {
  id?: string;
  code: string;
  text?: string;
  quantity?: number;
  anzahl?: number;
  jaw?: "OK" | "UK" | "both" | null;
  teeth?: string[];
};
export type DayPart = {
  id: string;
  state: "entwurf" | "bestaetigt" | "verworfen";
  kind: "original" | "nachtrag" | "korrektur" | null;
  corrects_part_id: string | null;
  occurred_at: string;
  documented_at: string;
  confirmed_at: string | null;
  source_confirmed_at: string | null;
  staff_initials: string | null;
  room_version_id: string | null;
  text: string;
  positions: DayPosition[];
  source_entry_id: string | null;
  source_ivoris_push_status: string | null;
};
export type DayRecord = {
  record: { id: string; patient_id: string; service_date: string; version: number; canonical_entry_id: string };
  parts: DayPart[];
};
type AddDayPartRequest = {
  expectedVersion: number;
  proposedKind: Kind;
  correctsPartId?: string | null;
  occurredAt: string;
  roomId: string | null;
  templateId: string | null;
  treatmentType?: string | null;
  appointmentType?: string | null;
  text: string;
  teeth: string[];
  variables: Record<string, unknown>;
  selection: Record<string, unknown>;
  positions: { code: string; text: string; anzahl?: number }[];
};
/** Inhalt aus dem Cockpit, ohne Tagesversion, Art und Zeit. */
export type DayDraftContent = Omit<AddDayPartRequest, "expectedVersion" | "proposedKind" | "correctsPartId" | "occurredAt">;
export type DayConflict = { id: string; kind: string; code: string; message: string };
export type DayPreview = {
  dayRecordId: string;
  basedOnVersion: number;
  resultingPositions: DayPosition[];
  conflicts: DayConflict[];
  billingClarificationRequired: boolean;
  ivoris: { action: "append_nachtrag" | "append_korrektur" | "already_pushed"; heading: "NACHTRAG" | "KORREKTUR" | null; text: string | null };
  previewToken: string;
};
export type SameDayEntry = {
  id: string; version: number; created_at: string; bestaetigt_am: string | null; text: string;
  zimmer_version_id?: string | null; zimmer_name?: string | null; bestaetigt_kuerzel?: string | null; ivoris_push_status?: string | null;
};
export type Kind = "nachtrag" | "korrektur";
/** Ziel einer Korrektur: ein Teil des Tagesdatensatzes oder, solange er noch nicht eröffnet ist, der erste bestätigte Eintrag. */
export type Target = { part: string } | { entry: string };
export type TargetOption = { key: string; target: Target; label: string; zeit: string };
/** Ein Stück Text, das heute schon auf der Karteikarte steht. */
export type BisherTeil = { key: string; kopf: string; text: string; inIvoris: boolean; zeit: string };
/** Fehler beim Ergänzen. `gesichert` heißt: der neue Teil liegt schon als Entwurf im Tagesdatensatz. */
export class TagFehler extends Error {
  constructor(message: string, readonly gesichert: string | null) { super(message); }
}

export const zeit = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";
const kiefer = (j: DayPosition["jaw"]) => (j === "both" ? "OK + UK" : j || "");
export const positionCode = (p: DayPosition) => {
  const menge = p.quantity ?? p.anzahl ?? 1;
  return [p.code, kiefer(p.jaw), p.teeth?.length ? `${t("scribe.day.tooth")} ${p.teeth.join(", ")}` : "", menge > 1 ? `×${menge}` : ""].filter(Boolean).join(" ");
};
const ort = (roomId: string | null | undefined, rooms: Record<string, string>, fallback?: string | null) =>
  (roomId && rooms[roomId]) || fallback || t("scribe.day.noRoom");
const teilName = (p: DayPart, rooms: Record<string, string>) =>
  t("scribe.day.partLabel", "de", { zeit: zeit(p.occurred_at), ort: ort(p.room_version_id, rooms), kuerzel: p.staff_initials || "—" });
const eintragName = (e: SameDayEntry) =>
  t("scribe.day.partLabel", "de", { zeit: zeit(e.bestaetigt_am || e.created_at), ort: e.zimmer_name || t("scribe.day.noRoom"), kuerzel: e.bestaetigt_kuerzel || "—" });

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(body.message || body.error || t("scribe.day.error"));
  return body as T;
}
// Jeder Schritt im Tagesdatensatz trägt den erwarteten Stand mit (expectedVersion). Ein zweites Senden legt deshalb nie etwas doppelt an.
const post = <T,>(url: string, body: unknown, headers: Record<string, string> = {}) =>
  scribeFetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }, { wiederholbar: true }).then((r) => json<T>(r));

/** Tagesdatensatz lesen. Fehlt er, ist das kein Fehler: dann gibt es heute höchstens den ersten Eintrag. */
export async function findeTag(patientId: string, datum: string): Promise<DayRecord | null> {
  const res = await scribeFetch(`/api/doku/tagesdatensatz?patient_id=${encodeURIComponent(patientId)}&termin_datum=${datum}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return json<DayRecord>(res);
}

/** Bestätigte Einträge desselben Patienten am selben Tag, frisch vom Server. Der eigene Entwurf zählt nicht. */
export async function gleicherTag(patientId: string, datum: string, eigenerEntwurf: string | null): Promise<SameDayEntry[]> {
  const res = await scribeFetch(`/api/doku/heute?datum=${datum}`, { cache: "no-store" });
  const body = await json<{ eintraege?: (SameDayEntry & { patient_id: string; status: string })[] }>(res);
  return (body.eintraege ?? [])
    .filter((e) => e.patient_id === patientId && e.status === "bestaetigt" && e.id !== eigenerEntwurf)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Bestätigte Teile, die im Tagestext stehen. Ein korrigierter Teil ist durch seine Korrektur ersetzt. */
function geltendeTeile(record: DayRecord) {
  const ersetzt = new Set(record.parts.filter((p) => p.state === "bestaetigt" && p.kind === "korrektur" && p.corrects_part_id).map((p) => p.corrects_part_id as string));
  return record.parts.filter((p) => p.state === "bestaetigt" && !ersetzt.has(p.id));
}

/** Was heute schon auf der Karteikarte steht: die Teile des Tagesdatensatzes, sonst die bestätigten Einträge. */
export function bisherAusTag(record: DayRecord | null, entries: SameDayEntry[], rooms: Record<string, string>): BisherTeil[] {
  if (record) {
    return geltendeTeile(record).map((p) => ({ key: `part:${p.id}`, kopf: teilName(p, rooms), text: p.text, inIvoris: p.source_ivoris_push_status === "gepusht", zeit: zeit(p.occurred_at) }));
  }
  return entries.map((e) => ({ key: `entry:${e.id}`, kopf: eintragName(e), text: e.text, inIvoris: e.ivoris_push_status === "gepusht", zeit: zeit(e.bestaetigt_am || e.created_at) }));
}

/**
 * Mögliche Korrekturziele. Ohne Tagesdatensatz nur der erste bestätigte Eintrag: weitere Einträge desselben Tages
 * werden beim Eröffnen als Entwurf vorgelegt und erst nach ihrer Entscheidung korrigierbar.
 */
export function korrekturZiele(record: DayRecord | null, entries: SameDayEntry[], rooms: Record<string, string>): TargetOption[] {
  if (record) return geltendeTeile(record).map((p) => ({ key: `part:${p.id}`, target: { part: p.id }, label: teilName(p, rooms), zeit: zeit(p.occurred_at) }));
  return entries.slice(0, 1).map((e) => ({ key: `entry:${e.id}`, target: { entry: e.id }, label: eintragName(e), zeit: zeit(e.bestaetigt_am || e.created_at) }));
}

/** Liest den Tagesdatensatz zum Patienten und Tag, nur lesend. Ist er nicht erreichbar, arbeitet das Cockpit mit den Einträgen. */
export function useTagesdatensatz(patientId: string | null, datum: string, aktiv: boolean, reloadKey: number) {
  const [record, setRecord] = useState<DayRecord | null>(null);
  useEffect(() => {
    if (!patientId || !aktiv) { setRecord(null); return; }
    let live = true;
    findeTag(patientId, datum).then((r) => { if (live) setRecord(r); }).catch(() => { if (live) setRecord(null); });
    return () => { live = false; };
  }, [patientId, datum, aktiv, reloadKey]);
  return record;
}

/** Ortsnamen aller Raumversionen, damit jeder Teil seinen Ort zeigt, auch aus anderen Räumen. */
export function useRaumNamen(aktiv: boolean) {
  const [namen, setNamen] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!aktiv) return;
    let live = true;
    scribeFetch("/api/doku/eintrag", { cache: "no-store" }, { still: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { versions?: { id: string; name: string }[] } | null) => {
        if (live && j?.versions) setNamen(Object.fromEntries(j.versions.map((v) => [v.id, v.name])));
      })
      .catch(() => null);
    return () => { live = false; };
  }, [aktiv]);
  return namen;
}

/**
 * Ergänzung in einem Zug: Tag lesen oder aus dem ersten bestätigten Eintrag eröffnen, Vorschau holen, den Teil als
 * Entwurf sichern und als Nachtrag oder Korrektur entscheiden. Jeder Schritt folgt dem Vertrag (Vorschau-Token).
 * Scheitert ein Schritt nach dem Sichern, ist nichts verloren: der Teil steht als offener Entwurf im Tag.
 */
export async function ergaenzeTag(args: {
  patientId: string; datum: string; content: DayDraftContent; canonical: { id: string; version: number } | null;
  kind: Kind; target: Target | null; occurredAt: string; reason?: string;
}): Promise<{ canonicalEntryId: string; partId: string; preview: DayPreview }> {
  let tag = await findeTag(args.patientId, args.datum);
  if (!tag) {
    if (!args.canonical) throw new TagFehler(t("scribe.day.notFound"), null);
    tag = await post<DayRecord>("/api/doku/tagesdatensatz", { canonicalEntryId: args.canonical.id, expectedEntryVersion: args.canonical.version });
  }
  let correctsPartId: string | null = null;
  if (args.kind === "korrektur") {
    const ziel = args.target;
    const teil = ziel && "part" in ziel
      ? tag.parts.find((p) => p.id === ziel.part)
      : ziel && "entry" in ziel ? tag.parts.find((p) => p.source_entry_id === ziel.entry) : undefined;
    if (!teil || teil.state !== "bestaetigt") throw new TagFehler(t("scribe.day.correctsMissing"), null);
    correctsPartId = teil.id;
  }
  const request: AddDayPartRequest = { ...args.content, expectedVersion: tag.record.version, proposedKind: args.kind, correctsPartId, occurredAt: args.occurredAt };
  const vorschau = await post<DayPreview>(`/api/doku/tagesdatensatz/${tag.record.id}/ergaenzung/vorschau`, request);
  const saved = await post<{ part: DayPart; decisionPreview: DayPreview }>(
    `/api/doku/tagesdatensatz/${tag.record.id}/ergaenzung`, request, { "x-day-preview-token": vorschau.previewToken });
  try {
    await post(`/api/doku/tagesdatensatz/${tag.record.id}/teile/${saved.part.id}/entscheidung`, {
      expectedVersion: saved.decisionPreview.basedOnVersion,
      decision: args.kind,
      reason: args.reason && args.reason.length >= 3 ? args.reason : args.kind === "nachtrag" ? t("scribe.day.reasonNachtrag") : t("scribe.day.reasonKorrektur"),
      correctsPartId,
      previewToken: saved.decisionPreview.previewToken,
    });
  } catch (e) {
    throw new TagFehler(e instanceof Error ? e.message : t("scribe.day.error"), saved.part.id);
  }
  return { canonicalEntryId: tag.record.canonical_entry_id, partId: saved.part.id, preview: saved.decisionPreview };
}

/**
 * Auf der Karteikarte: was heute schon dasteht, gedämpft. Darunter beginnt mit einer grünen Linie der neue Teil.
 * Bei einer Korrektur ist der ersetzte Teil durchgestrichen.
 */
export function KarteBisher({ teile, ersetzt, linie }: { teile: BisherTeil[]; ersetzt: string | null; linie: string }) {
  if (!teile.length) return null;
  return (
    <div className="tag-bisher">
      {teile.map((p) => (
        <div key={p.key} className={`tag-bisher-teil${ersetzt === p.key ? " ersetzt" : ""}`}>
          <div className="tag-bisher-kopf">
            <span>{p.kopf}</span>
            {p.inIvoris && <span>· {t("scribe.day.inIvoris")}</span>}
            {ersetzt === p.key && <span className="tag-ersetzt-marke">· {t("scribe.day.replaced")}</span>}
          </div>
          <div className="tag-bisher-text">{p.text}</div>
        </div>
      ))}
      <div className="tag-neu-linie"><span>{linie}</span></div>
    </div>
  );
}

/** Wahl-Pillen wie bei der Behandlungsart: Nachtrag oder Korrektur eines bestimmten Teils. */
export function ArtWahl({ kind, selected, options, onNachtrag, onKorrektur, disabled, children }: {
  kind: Kind; selected: string | null; options: TargetOption[]; disabled?: boolean;
  onNachtrag: () => void; onKorrektur: (o: TargetOption) => void; children?: ReactNode;
}) {
  return (
    <div className="tag-artwahl">
      <span className="tag-artwahl-label">{t("scribe.day.kindLegend")}</span>
      <div className="wahlzeile">
        <button type="button" className="wahl" aria-pressed={kind === "nachtrag"} onClick={onNachtrag} disabled={disabled}>{t("scribe.day.kindNachtragShort")}</button>
        {options.map((o) => (
          <button key={o.key} type="button" className="wahl" aria-pressed={kind === "korrektur" && selected === o.key} onClick={() => onKorrektur(o)} disabled={disabled}>
            {t("scribe.day.kindKorrekturOf", "de", { teil: o.label })}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Ausgang Abrechnung nach dem Eintragen: Leistungen des ganzen Tages und was die Abrechnung klärt. */
export function TagesLeistungen({ preview }: { preview: DayPreview }) {
  return (
    <>
      <div className="geldtabelle">
        <table>
          <tbody>
            {preview.resultingPositions.length
              ? preview.resultingPositions.map((p, i) => <tr key={p.id ?? i}><td className="code">{positionCode(p)}</td><td>{p.text ?? ""}</td></tr>)
              : <tr><td className="leer">{t("scribe.day.noPositions")}</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="geldnotiz">{t("scribe.day.dayPositionsNote")}</p>
      {preview.conflicts.length > 0 && (
        <p className="geldnotiz tag-klaerung"><b>{t("scribe.day.conflictsLabel")}:</b> {preview.conflicts.map((c) => c.message).join(" ")} {t("scribe.day.conflictsNote")}</p>
      )}
    </>
  );
}

export type EntscheidungErgebnis = { partId: string; decision: Kind | "verwerfen"; preview: DayPreview | null; canonicalEntryId: string };

/**
 * Offene Entwurfsteile des Tages als Wache-Karten. Ein Mensch entscheidet: Nachtrag, Korrektur oder verwerfen.
 * Nachtrag und Korrektur zeigen vorher, was in die Akte geht und welche Leistungen danach zählen.
 * Ohne offene Teile oder wenn der Tagesdatensatz nicht lesbar ist, bleibt der Bereich unsichtbar.
 */
export function OffeneTeile({ record, patientName, rooms, onChanged }: {
  record: DayRecord | null; patientName: string; rooms: Record<string, string>; onChanged: (r: EntscheidungErgebnis) => void;
}) {
  const [offen, setOffen] = useState<string | null>(null);
  const entwuerfe = record?.parts.filter((p) => p.state === "entwurf") ?? [];
  if (!record || !entwuerfe.length) return null;
  return (
    <>
      <p className="abschnitt">{t("scribe.day.openTitle", "de", { name: patientName })}</p>
      <div className="listengruppe">
        <p className="gruppenlabel offen">{t("scribe.day.openGroup", "de", { n: entwuerfe.length })}</p>
        <div className="tag-entwuerfe">
          {entwuerfe.map((p) => (
            <div key={p.id} className="wache tag-entwurf">
              <div className="zeit">{zeit(p.occurred_at)} · {ort(p.room_version_id, rooms)} · {p.staff_initials || "—"}</div>
              <div className="wer">{p.source_entry_id ? t("scribe.day.draftFromEntry") : t("scribe.day.draftFromCockpit")}</div>
              <div className="was">{p.text}</div>
              <span className="pille rot">{t("scribe.day.draftPill")}</span>
              {offen === p.id
                ? <Entscheidung tag={record} part={p} rooms={rooms} onCancel={() => setOffen(null)} onDone={(r) => { setOffen(null); onChanged(r); }} />
                : <div className="tag-entwurf-aktion"><button type="button" className="neben klein" onClick={() => setOffen(p.id)}>{t("scribe.day.decide")}</button></div>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Entscheidung({ tag, part, rooms, onCancel, onDone }: {
  tag: DayRecord; part: DayPart; rooms: Record<string, string>; onCancel: () => void; onDone: (r: EntscheidungErgebnis) => void;
}) {
  const [decision, setDecision] = useState<Kind | "verwerfen">(part.kind === "korrektur" ? "korrektur" : "nachtrag");
  const [corrects, setCorrects] = useState<string | null>(part.corrects_part_id);
  const [preview, setPreview] = useState<DayPreview | null>(null);
  const [grund, setGrund] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const ziele = geltendeTeile(tag);

  useEffect(() => {
    if (decision === "verwerfen" || (decision === "korrektur" && !corrects)) { setPreview(null); return; }
    let live = true;
    setFehler(null);
    post<DayPreview>(`/api/doku/tagesdatensatz/${tag.record.id}/teile/${part.id}/entscheidung/vorschau`, { decision, correctsPartId: decision === "korrektur" ? corrects : null })
      .then((p) => { if (live) setPreview(p); })
      .catch((e) => { if (live) { setPreview(null); setFehler(e instanceof Error ? e.message : t("scribe.day.error")); } });
    return () => { live = false; };
  }, [tag.record.id, part.id, decision, corrects]);

  async function speichern() {
    const reason = grund.trim() || (decision === "verwerfen" ? "" : decision === "nachtrag" ? t("scribe.day.reasonNachtrag") : t("scribe.day.reasonKorrektur"));
    if (reason.length < 3) { setFehler(t("scribe.day.reasonMissing")); return; }
    setSendet(true);
    setFehler(null);
    try {
      await post(`/api/doku/tagesdatensatz/${tag.record.id}/teile/${part.id}/entscheidung`, decision === "verwerfen"
        ? { expectedVersion: tag.record.version, decision, reason }
        : { expectedVersion: preview?.basedOnVersion ?? tag.record.version, decision, reason, correctsPartId: decision === "korrektur" ? corrects : null, previewToken: preview?.previewToken ?? null });
      onDone({ partId: part.id, decision, preview: decision === "verwerfen" ? null : preview, canonicalEntryId: tag.record.canonical_entry_id });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : t("scribe.day.error"));
    } finally {
      setSendet(false);
    }
  }

  const grundLabel = decision === "verwerfen" ? t("scribe.day.reasonRequired") : t("scribe.day.reasonOptional");
  return (
    <div className="tag-entscheidung">
      <div className="wahlzeile">
        <button type="button" className="wahl" aria-pressed={decision === "nachtrag"} onClick={() => setDecision("nachtrag")}>{t("scribe.day.kindNachtragShort")}</button>
        {ziele.map((p) => (
          <button key={p.id} type="button" className="wahl" aria-pressed={decision === "korrektur" && corrects === p.id} onClick={() => { setDecision("korrektur"); setCorrects(p.id); }}>
            {t("scribe.day.kindKorrekturOf", "de", { teil: teilName(p, rooms) })}
          </button>
        ))}
        <button type="button" className="wahl" aria-pressed={decision === "verwerfen"} onClick={() => setDecision("verwerfen")}>{t("scribe.day.discard")}</button>
      </div>
      {decision === "verwerfen"
        ? <p className="geldnotiz">{t("scribe.day.discardNote")}</p>
        : preview && (
          <div className="tag-entscheidung-vorschau">
            <p><span className="tag-mini-label">{t("scribe.day.ivorisLabel")}</span>{preview.ivoris.action === "already_pushed" ? t("scribe.day.ivorisAlready") : <><b>{preview.ivoris.heading}:</b> {preview.ivoris.text}</>}</p>
            <p><span className="tag-mini-label">{t("scribe.day.positionsLabel")}</span>{preview.resultingPositions.length ? preview.resultingPositions.map(positionCode).join(" · ") : t("scribe.day.noPositions")}</p>
            {preview.conflicts.length > 0 && <p className="tag-klaerung"><span className="tag-mini-label">{t("scribe.day.conflictsLabel")}</span>{preview.conflicts.map((c) => c.message).join(" ")}</p>}
          </div>
        )}
      <input className="freitext" placeholder={grundLabel} aria-label={grundLabel} value={grund} onChange={(e) => setGrund(e.target.value)} maxLength={2000} />
      {fehler && <span className="hinweis-fehlt" role="alert">{fehler}</span>}
      <div className="tag-entwurf-aktion">
        <button type="button" className="haupt" onClick={speichern} disabled={sendet || (decision !== "verwerfen" && !preview)}>
          {sendet ? t("scribe.day.saving") : decision === "verwerfen" ? t("scribe.day.discardConfirm") : t("scribe.day.decisionConfirm")}
        </button>
        <button type="button" className="neben" onClick={onCancel} disabled={sendet}>{t("scribe.day.cancel")}</button>
      </div>
    </div>
  );
}
