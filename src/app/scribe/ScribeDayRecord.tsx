"use client";

import { useEffect, useMemo, useState } from "react";
import { t } from "@/lib/i18n";

/*
 * Tagesdatensatz im Scribe-Cockpit (Vertrag: anima-leitstand/docs/2026-11-05-tagesdatensatz-klaerfaelle.md).
 * Ein Patient hat je Behandlungstag einen Eintrag. Wer später am selben Tag dokumentiert, ergänzt ihn als Nachtrag
 * oder Korrektur, nach einer Vorschau, die nichts speichert. Positionskonflikte blockieren nie die Dokumentation,
 * sie gehen als Klärfall an die Abrechnung. Nach IVORIS geht nur der neue Teil.
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
export type AddDayPartRequest = {
  expectedVersion: number;
  proposedKind: "nachtrag" | "korrektur";
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
/** Inhalt aus dem Cockpit, ohne Tagesversion, Art und Zeit. Diese setzt die Ergänzung selbst. */
export type DayDraftContent = Omit<AddDayPartRequest, "expectedVersion" | "proposedKind" | "correctsPartId" | "occurredAt">;
type Conflict = { id: string; kind: string; code: string; message: string };
type Preview = {
  dayRecordId: string;
  basedOnVersion: number;
  resultingPositions: DayPosition[];
  conflicts: Conflict[];
  billingClarificationRequired: boolean;
  ivoris: { action: "append_nachtrag" | "append_korrektur" | "already_pushed"; heading: "NACHTRAG" | "KORREKTUR" | null; text: string | null };
  previewToken: string;
};
export type SameDayEntry = { id: string; version: number; created_at: string; zimmer_name?: string | null; bestaetigt_am: string | null };
type Kind = "nachtrag" | "korrektur";

const zeit = (v: string | null | undefined) =>
  v ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(v)) : "—";
const heuteBerlin = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const kiefer = (j: DayPosition["jaw"]) => (j === "both" ? "OK + UK" : j || "");
const positionText = (p: DayPosition) => {
  const menge = p.quantity ?? p.anzahl ?? 1;
  return [p.code, kiefer(p.jaw), p.teeth?.length ? `${t("scribe.day.tooth")} ${p.teeth.join(", ")}` : "", menge > 1 ? `× ${menge}` : ""].filter(Boolean).join(" ");
};
const teilName = (p: DayPart, rooms: Record<string, string>) =>
  t("scribe.day.partLabel", "de", { zeit: zeit(p.occurred_at), ort: (p.room_version_id && rooms[p.room_version_id]) || t("scribe.day.noRoom"), kuerzel: p.staff_initials || "—" });

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(body.message || body.error || t("scribe.day.error"));
  return body as T;
}
export async function findeTag(patientId: string, datum: string): Promise<DayRecord | null> {
  const res = await fetch(`/api/doku/tagesdatensatz?patient_id=${encodeURIComponent(patientId)}&termin_datum=${datum}`, { cache: "no-store" });
  if (res.status === 404) return null;
  return json<DayRecord>(res);
}
async function eroeffneTag(entry: { id: string; version: number }): Promise<DayRecord> {
  return json<DayRecord>(await fetch("/api/doku/tagesdatensatz", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ canonicalEntryId: entry.id, expectedEntryVersion: entry.version }),
  }));
}
const post = <T,>(url: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then((r) => json<T>(r));

/** Bestätigte Einträge desselben Patienten am selben Tag, frisch vom Server. Der eigene Entwurf zählt nicht. */
export async function gleicherTag(patientId: string, datum: string, eigenerEntwurf: string | null): Promise<SameDayEntry[]> {
  const res = await fetch(`/api/doku/heute?datum=${datum}`, { cache: "no-store" });
  const body = await json<{ eintraege?: (SameDayEntry & { patient_id: string; status: string })[] }>(res);
  return (body.eintraege ?? [])
    .filter((e) => e.patient_id === patientId && e.status === "bestaetigt" && e.id !== eigenerEntwurf)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Hinweis vor dem Bestätigen: Für diesen Patienten gibt es heute schon einen Eintrag. */
export function DayHint({ entries, name }: { entries: SameDayEntry[]; name: string }) {
  if (!entries.length) return null;
  const first = entries[0];
  return (
    <div className="tag-hinweis" role="note">
      <strong>{t("scribe.day.hintTitle")}</strong>
      <span>{t("scribe.day.hint", "de", { name, ort: first.zimmer_name || t("scribe.day.noRoom"), zeit: zeit(first.bestaetigt_am || first.created_at) })}</span>
    </div>
  );
}

/** Vorschau in Alltagssprache: was nach IVORIS geht, welche Leistungen danach zählen, was Sabine klärt. */
function PreviewView({ preview }: { preview: Preview }) {
  return (
    <div className="tag-vorschau">
      <div>
        <span className="tag-label">{t("scribe.day.ivorisLabel")}</span>
        {preview.ivoris.action === "already_pushed"
          ? <p>{t("scribe.day.ivorisAlready")}</p>
          : <p className="tag-ivoris"><b>{preview.ivoris.heading}:</b> {preview.ivoris.text}</p>}
        <small>{t("scribe.day.ivorisOnlyNew")}</small>
      </div>
      <div>
        <span className="tag-label">{t("scribe.day.positionsLabel")}</span>
        <p>{preview.resultingPositions.length ? preview.resultingPositions.map(positionText).join(" · ") : t("scribe.day.noPositions")}</p>
      </div>
      {preview.conflicts.length > 0 && (
        <div className="tag-konflikt">
          <span className="tag-label">{t("scribe.day.conflictsLabel")}</span>
          <ul>{preview.conflicts.map((c) => <li key={c.id}>{c.message}</li>)}</ul>
          <small>{t("scribe.day.conflictsNote")}</small>
        </div>
      )}
    </div>
  );
}

/** Art der Ergänzung: Nachtrag (Standard) oder Korrektur eines bestätigten Teils. */
function KindChoice({ kind, corrects, parts, rooms, onKind, onCorrects, name }: {
  kind: Kind; corrects: string | null; parts: DayPart[]; rooms: Record<string, string>; name: string;
  onKind: (k: Kind) => void; onCorrects: (id: string) => void;
}) {
  const confirmed = parts.filter((p) => p.state === "bestaetigt");
  return (
    <fieldset className="tag-art">
      <legend>{t("scribe.day.kindLegend")}</legend>
      <label><input type="radio" name={`${name}-art`} checked={kind === "nachtrag"} onChange={() => onKind("nachtrag")} /> {t("scribe.day.kindNachtrag")}</label>
      <label><input type="radio" name={`${name}-art`} checked={kind === "korrektur"} onChange={() => onKind("korrektur")} disabled={!confirmed.length} /> {t("scribe.day.kindKorrektur")}</label>
      {kind === "korrektur" && (
        <div className="tag-teile">
          {confirmed.map((p) => (
            <label key={p.id}><input type="radio" name={`${name}-teil`} checked={corrects === p.id} onChange={() => onCorrects(p.id)} /> {teilName(p, rooms)}<small>{p.text.slice(0, 120)}{p.text.length > 120 ? " …" : ""}</small></label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/**
 * Ergänzen eines vorhandenen Tages: Tag finden oder aus dem frühesten bestätigten Eintrag eröffnen, Vorschau,
 * dann Entwurfsteil speichern und als Nachtrag oder Korrektur entscheiden. Erst der letzte Schritt ist endgültig.
 */
export function DayAddPanel({ patientId, datum, content, canonical, preset, rooms, onDone, onCancel, onFallback }: {
  patientId: string;
  datum: string;
  content: DayDraftContent;
  canonical: { id: string; version: number } | null;
  preset?: { kind: Kind; correctsPartId: string | null };
  rooms: Record<string, string>;
  onDone: (result: { canonicalEntryId: string; kind: Kind; partId: string }) => void;
  onCancel: () => void;
  /** Notweg, wenn der Tagesdatensatz nicht erreichbar ist: wie bisher als eigenen Eintrag speichern. Die Dokumentation darf nie scheitern. */
  onFallback?: () => void;
}) {
  const heute = datum === heuteBerlin();
  const [tag, setTag] = useState<DayRecord | null>(null);
  const [kind, setKind] = useState<Kind>(preset?.kind ?? "nachtrag");
  const [corrects, setCorrects] = useState<string | null>(preset?.correctsPartId ?? null);
  const [uhrzeit, setUhrzeit] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Uhrzeit beim Öffnen festhalten, damit Vorschau und Speichern denselben Inhalt prüfen.
  const [jetzt] = useState(() => new Date().toISOString());
  const occurredAt = heute ? jetzt : /^\d{2}:\d{2}$/.test(uhrzeit) ? new Date(`${datum}T${uhrzeit}:00`).toISOString() : null;
  const request = useMemo<AddDayPartRequest | null>(() => {
    if (!tag || !occurredAt || (kind === "korrektur" && !corrects)) return null;
    return { ...content, expectedVersion: tag.record.version, proposedKind: kind, correctsPartId: kind === "korrektur" ? corrects : null, occurredAt };
  }, [tag, occurredAt, kind, corrects, content]);

  // Tag laden oder eröffnen. Eröffnen legt nur den Tagesdatensatz zum vorhandenen Eintrag an und ändert keinen Text.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const vorhanden = await findeTag(patientId, datum);
        const rec = vorhanden ?? (canonical ? await eroeffneTag(canonical) : null);
        if (!rec) throw new Error(t("scribe.day.notFound"));
        if (live) setTag(rec);
      } catch (e) {
        if (live) setFehler(e instanceof Error ? e.message : t("scribe.day.error"));
      } finally {
        if (live) setLaedt(false);
      }
    })();
    return () => { live = false; };
  }, [patientId, datum, canonical]);

  // Vorschau neu holen, sobald Art, Bezug oder Uhrzeit feststehen. Sie speichert nichts.
  useEffect(() => {
    if (!tag || !request) { setPreview(null); return; }
    let live = true;
    setFehler(null);
    post<Preview>(`/api/doku/tagesdatensatz/${tag.record.id}/ergaenzung/vorschau`, request)
      .then((p) => { if (live) setPreview(p); })
      .catch((e) => { if (live) { setPreview(null); setFehler(e instanceof Error ? e.message : t("scribe.day.error")); } });
    return () => { live = false; };
  }, [tag, request]);

  async function bestaetigen() {
    if (!tag || !request || !preview) return;
    setSendet(true);
    setFehler(null);
    try {
      const saved = await post<{ part: DayPart; decisionPreview: Preview }>(
        `/api/doku/tagesdatensatz/${tag.record.id}/ergaenzung`, request, { "x-day-preview-token": preview.previewToken });
      await post(`/api/doku/tagesdatensatz/${tag.record.id}/teile/${saved.part.id}/entscheidung`, {
        expectedVersion: saved.decisionPreview.basedOnVersion,
        decision: kind,
        reason: kind === "nachtrag" ? t("scribe.day.reasonNachtrag") : t("scribe.day.reasonKorrektur"),
        correctsPartId: kind === "korrektur" ? corrects : null,
        previewToken: saved.decisionPreview.previewToken,
      });
      onDone({ canonicalEntryId: tag.record.canonical_entry_id, kind, partId: saved.part.id });
    } catch (e) {
      setFehler(e instanceof Error ? e.message : t("scribe.day.error"));
    } finally {
      setSendet(false);
    }
  }

  return (
    <section className="tag-panel" aria-label={t("scribe.day.panelTitle")}>
      <div className="tag-kopf">
        <strong>{t("scribe.day.panelTitle")}</strong>
        <span>{t("scribe.day.panelLead")}</span>
      </div>
      {laedt && <p role="status">{t("scribe.day.loading")}</p>}
      {tag && (
        <>
          <ul className="tag-bestand">
            {tag.parts.filter((p) => p.state === "bestaetigt").map((p) => <li key={p.id}>{teilName(p, rooms)}</li>)}
          </ul>
          <KindChoice kind={kind} corrects={corrects} parts={tag.parts} rooms={rooms} name={tag.record.id} onKind={setKind} onCorrects={setCorrects} />
          {!heute && (
            <label className="tag-zeit">
              <span>{t("scribe.day.timeLabel")}</span>
              <input type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} aria-label={t("scribe.day.timeLabel")} />
            </label>
          )}
          {!occurredAt && <p className="hinweis-fehlt">{t("scribe.day.timeMissing")}</p>}
          {kind === "korrektur" && !corrects && <p className="hinweis-fehlt">{t("scribe.day.correctsMissing")}</p>}
          {preview && <PreviewView preview={preview} />}
        </>
      )}
      {fehler && <p className="hinweis-fehlt" role="alert">{fehler}</p>}
      <div className="tag-aktionen">
        <button type="button" className="haupt" onClick={bestaetigen} disabled={!preview || sendet}>
          {sendet ? t("scribe.day.saving") : kind === "nachtrag" ? t("scribe.day.confirmNachtrag") : t("scribe.day.confirmKorrektur")}
        </button>
        <button type="button" className="neben" onClick={onCancel} disabled={sendet}>{t("scribe.day.cancel")}</button>
        {fehler && !tag && onFallback && <button type="button" className="neben" onClick={onFallback} disabled={sendet}>{t("scribe.day.fallback")}</button>}
      </div>
      {fehler && !tag && onFallback && <small className="tag-hinweis-klein">{t("scribe.day.fallbackNote")}</small>}
    </section>
  );
}

/**
 * Teile des heutigen Tages für den gewählten Patienten. Offene Entwurfsteile entscheidet ein Mensch:
 * Nachtrag, Korrektur oder verwerfen. Nachtrag und Korrektur brauchen eine aktuelle Vorschau.
 */
export function DayPartsPanel({ patientId, datum, rooms, reloadKey, onChanged }: {
  patientId: string; datum: string; rooms: Record<string, string>; reloadKey: number; onChanged: () => void;
}) {
  const [tag, setTag] = useState<DayRecord | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<string | null>(null);
  const [neu, setNeu] = useState(0);
  useEffect(() => {
    let live = true;
    // Ist der Tagesdatensatz nicht lesbar (z. B. noch nicht freigeschaltet), bleibt das Feld still: das Cockpit arbeitet wie bisher.
    findeTag(patientId, datum).then((r) => { if (live) { setTag(r); setFehler(null); } }).catch(() => { if (live) { setTag(null); setFehler(null); } });
    return () => { live = false; };
  }, [patientId, datum, reloadKey, neu]);
  if (fehler) return <p className="hinweis-fehlt">{fehler}</p>;
  if (!tag) return null;
  const sichtbar = tag.parts.filter((p) => p.state !== "verworfen");
  const entwuerfe = sichtbar.filter((p) => p.state === "entwurf");
  return (
    <section className="tag-teile-panel" aria-label={t("scribe.day.partsTitle")}>
      <div className="tag-kopf">
        <strong>{t("scribe.day.partsTitle")}</strong>
        <span>{entwuerfe.length ? t("scribe.day.partsOpen", "de", { n: entwuerfe.length }) : t("scribe.day.partsAllDone")}</span>
      </div>
      <ol className="tag-teil-liste">
        {sichtbar.map((p) => (
          <li key={p.id} className={p.state === "entwurf" ? "ist-entwurf" : ""}>
            <div className="tag-teil-zeile">
              <span>{teilName(p, rooms)}</span>
              <span className="tag-status">{p.state === "entwurf" ? t("scribe.day.stateDraft") : p.kind === "nachtrag" ? t("scribe.day.stateNachtrag") : p.kind === "korrektur" ? t("scribe.day.stateKorrektur") : t("scribe.day.stateOriginal")}</span>
            </div>
            <p>{p.text}</p>
            {p.state === "entwurf" && offen !== p.id && (
              <button type="button" className="neben klein" onClick={() => setOffen(p.id)}>{t("scribe.day.decide")}</button>
            )}
            {p.state === "entwurf" && offen === p.id && (
              <DraftDecision tag={tag} part={p} rooms={rooms} onCancel={() => setOffen(null)} onDone={() => { setOffen(null); setNeu((n) => n + 1); onChanged(); }} />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Entscheidung über einen Entwurfsteil. Die Vorschau zeigt vorher, was nach IVORIS geht und welche Leistungen zählen. */
function DraftDecision({ tag, part, rooms, onCancel, onDone }: {
  tag: DayRecord; part: DayPart; rooms: Record<string, string>; onCancel: () => void; onDone: () => void;
}) {
  const [decision, setDecision] = useState<Kind | "verwerfen">(part.kind === "korrektur" ? "korrektur" : "nachtrag");
  const [corrects, setCorrects] = useState<string | null>(part.corrects_part_id);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [grund, setGrund] = useState("");
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const confirmed = tag.parts.filter((p) => p.state === "bestaetigt");

  useEffect(() => {
    if (decision === "verwerfen" || (decision === "korrektur" && !corrects)) { setPreview(null); return; }
    let live = true;
    setFehler(null);
    post<Preview>(`/api/doku/tagesdatensatz/${tag.record.id}/teile/${part.id}/entscheidung/vorschau`, { decision, correctsPartId: decision === "korrektur" ? corrects : null })
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
      onDone();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : t("scribe.day.error"));
    } finally {
      setSendet(false);
    }
  }

  return (
    <div className="tag-entscheidung">
      <fieldset className="tag-art">
        <legend>{t("scribe.day.decisionLegend")}</legend>
        <label><input type="radio" name={`${part.id}-d`} checked={decision === "nachtrag"} onChange={() => setDecision("nachtrag")} /> {t("scribe.day.kindNachtrag")}</label>
        <label><input type="radio" name={`${part.id}-d`} checked={decision === "korrektur"} onChange={() => setDecision("korrektur")} disabled={!confirmed.length} /> {t("scribe.day.kindKorrektur")}</label>
        <label><input type="radio" name={`${part.id}-d`} checked={decision === "verwerfen"} onChange={() => setDecision("verwerfen")} /> {t("scribe.day.discard")}</label>
        {decision === "korrektur" && (
          <div className="tag-teile">
            {confirmed.map((p) => <label key={p.id}><input type="radio" name={`${part.id}-k`} checked={corrects === p.id} onChange={() => setCorrects(p.id)} /> {teilName(p, rooms)}</label>)}
          </div>
        )}
      </fieldset>
      {decision === "verwerfen" ? <p className="tag-hinweis-klein">{t("scribe.day.discardNote")}</p> : preview && <PreviewView preview={preview} />}
      <label className="tag-grund">
        <span>{decision === "verwerfen" ? t("scribe.day.reasonRequired") : t("scribe.day.reasonOptional")}</span>
        <input className="freitext" value={grund} onChange={(e) => setGrund(e.target.value)} maxLength={2000} />
      </label>
      {fehler && <p className="hinweis-fehlt" role="alert">{fehler}</p>}
      <div className="tag-aktionen">
        <button type="button" className="haupt" onClick={speichern} disabled={sendet || (decision !== "verwerfen" && !preview)}>
          {sendet ? t("scribe.day.saving") : decision === "verwerfen" ? t("scribe.day.discardConfirm") : t("scribe.day.decisionConfirm")}
        </button>
        <button type="button" className="neben" onClick={onCancel} disabled={sendet}>{t("scribe.day.cancel")}</button>
      </div>
    </div>
  );
}
