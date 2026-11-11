/**
 * Anbindung an die Zeitmaschine der Vorlagen (Datenvertrag docs/2026-11-10-scribe-zeitmaschine-glocke-contract.md).
 * Jede Aktion bekommt eine eigene requestId. Bei einem Netzfehler wird genau dieselbe Anfrage 1 Mal wiederholt,
 * der Server erkennt sie an der requestId und führt sie nicht doppelt aus. Das Wiederholen und das Anmeldefenster
 * übernimmt die gemeinsame Anfrage-Schicht (verbindung.ts).
 */
import { scribeFetch } from "./verbindung";

export type BausteinZustand = { text: string; hidden: boolean };
export type BausteinAktion = "hide" | "show" | "rename" | "restore_practice" | "undo" | "restore_at";
export type VorlagenAenderung = {
  id: string;
  seq: number;
  template_id: string;
  gruppe: string;
  option_key: string;
  action: BausteinAktion;
  before_state: BausteinZustand;
  after_state: BausteinZustand;
  actor_name: string;
  created_at: string;
  reverses_id: string | null;
};
export type GeloeschterPraxisText = {
  option_key: string;
  gruppe: string;
  option_index: number;
  baseline: BausteinZustand;
  state: BausteinZustand;
  last_change_id: string | null;
  created_at: string;
};
export type VorlagenVerlauf = {
  revision: number;
  changes: VorlagenAenderung[];
  nextBeforeSeq: number | null;
  historyAvailableFrom: string | null;
  deletedPracticeOptions: GeloeschterPraxisText[];
};
export type AenderungsErgebnis =
  | { ok: true; revision: number; changeIds: string[] }
  | { ok: false; code: string; message: string };

export class ZeitmaschinenFehler extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function alsFehler(res: Response): Promise<ZeitmaschinenFehler> {
  const json = (await res.json().catch(() => null)) as { code?: string; message?: string; error?: string } | null;
  return new ZeitmaschinenFehler(json?.code ?? "scribe_workspace_unavailable", json?.message ?? json?.error ?? "");
}

/** Änderungsbuch einer Vorlage, neueste zuerst, 100 je Seite. */
export async function ladeVerlauf(templateId: string, beforeSeq?: number | null): Promise<VorlagenVerlauf> {
  const query = new URLSearchParams({ templateId });
  if (beforeSeq) query.set("beforeSeq", String(beforeSeq));
  const res = await scribeFetch(`/api/doku/vorlagen/changes?${query}`, { cache: "no-store" });
  if (!res.ok) throw await alsFehler(res);
  return (await res.json()) as VorlagenVerlauf;
}

/** 1 Änderung an einer Vorlage. Liefert den neuen Stand (revision) und die IDs der neuen Einträge im Buch. */
export async function aendereVorlage(input: {
  templateId: string;
  expectedRevision: number;
  action: BausteinAktion;
  optionKey?: string;
  text?: string;
  changeId?: string;
  at?: string;
}): Promise<AenderungsErgebnis> {
  const body = JSON.stringify({ ...input, requestId: crypto.randomUUID() });
  const res = await scribeFetch("/api/doku/vorlagen/changes", { method: "POST", headers: { "Content-Type": "application/json" }, body }, { wiederholbar: true });
  if (!res.ok) {
    const fehler = await alsFehler(res);
    return { ok: false, code: fehler.code, message: fehler.message };
  }
  const json = (await res.json()) as { revision: number; changeIds: string[] };
  return { ok: true, revision: json.revision, changeIds: json.changeIds ?? [] };
}

/** Konflikte, bei denen der Stand neu geladen werden muss. */
export const NEU_LADEN = new Set(["template_revision_stale", "change_superseded", "idempotency_conflict", "template_layout_changed"]);
