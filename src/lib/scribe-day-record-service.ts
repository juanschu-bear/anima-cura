import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { checkScribeConsistency } from "@/lib/scribe-consistency-service";
import {consistencyAudit,consistencyConfirmation,isConsistencyAcknowledged,type ConsistencyAudit} from '@/lib/scribe-consistency-acknowledgement';
import {createServerClient} from '@/lib/db/supabase';
import {
  addDayPartRequestSchema,
  buildDayPreviewToken,
  decideDayPartRequestSchema,
  mergeDayPositions,
  type AddDayPartRequest,
  type DecideDayPartRequest,
} from "@/lib/scribe-day-record";

type Db = SupabaseClient;

export type StoredDayPart = {
  id: string;
  tagesdatensatz_id: string;
  state: "entwurf" | "bestaetigt" | "verworfen";
  kind: "original" | "nachtrag" | "korrektur" | null;
  corrects_part_id: string | null;
  occurred_at: string;
  documented_at: string;
  confirmed_at: string | null;
  source_confirmed_at: string | null;
  staff_initials: string | null;
  room_version_id: string | null;
  template_id: string | null;
  treatment_type: string | null;
  appointment_type: string | null;
  text: string;
  teeth: string[];
  variables: Record<string, unknown>;
  selection: Record<string, unknown>;
  positions: unknown[];
  source_entry_id: string | null;
  source_entry_version: number | null;
  source_ivoris_push_status: string | null;
  decision_reason: string | null;
};

export type StoredDayRecord = {
  id: string;
  patient_id: string;
  service_date: string;
  version: number;
  canonical_entry_id: string;
  created_at: string;
  updated_at: string;
};

export class DayRecordError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
  }
}

const bootstrapSchema = z.object({
  canonicalEntryId: z.string().uuid(),
  expectedEntryVersion: z.number().int().positive(),
});

function dbError(error: { message: string } | null, fallback: string): never {
  throw new DayRecordError("day_record_storage_failed", 500, error?.message || fallback);
}

export async function readDayRecord(db: Db, id: string) {
  const [{ data: record, error: recordError }, { data: parts, error: partsError }] = await Promise.all([
    db.from("doku_tagesdatensaetze").select("*").eq("id", id).maybeSingle(),
    db.from("doku_tagesdatensatz_teile").select("*").eq("tagesdatensatz_id", id).order("occurred_at", { ascending: true }).order("documented_at", { ascending: true }),
  ]);
  if (recordError) dbError(recordError, "Tagesdatensatz konnte nicht gelesen werden.");
  if (!record) throw new DayRecordError("day_record_not_found", 404, "Tagesdatensatz nicht gefunden.");
  if (partsError) dbError(partsError, "Tagesabschnitte konnten nicht gelesen werden.");
  return { record: record as StoredDayRecord, parts: (parts ?? []) as StoredDayPart[] };
}

export async function findDayRecord(db: Db, patientId: string, serviceDate: string) {
  if (!z.string().uuid().safeParse(patientId).success || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    throw new DayRecordError("day_lookup_invalid", 400, "Patient oder Behandlungstag ist ungültig.");
  }
  const { data, error } = await db.from("doku_tagesdatensaetze")
    .select("id")
    .eq("patient_id", patientId)
    .eq("service_date", serviceDate)
    .maybeSingle();
  if (error) dbError(error, "Tagesdatensatz konnte nicht gesucht werden.");
  if (!data) throw new DayRecordError("day_record_not_found", 404, "Für diesen Behandlungstag besteht noch kein Tagesdatensatz.");
  return readDayRecord(db, String(data.id));
}

export async function bootstrapDayRecord(db: Db, raw: unknown) {
  const parsed = bootstrapSchema.safeParse(raw);
  if (!parsed.success) throw new DayRecordError("day_bootstrap_invalid", 422, "Ausgangseintrag oder Version ist ungültig.");
  const { data, error } = await db.rpc("bootstrap_doku_day_record", {
    p_entry_id: parsed.data.canonicalEntryId,
    p_expected_entry_version: parsed.data.expectedEntryVersion,
  });
  if (error || !data) dbError(error, "Tagesdatensatz konnte nicht eröffnet werden.");
  return readDayRecord(db, String(data));
}

function partFromInput(id: string, recordId: string, input: AddDayPartRequest): StoredDayPart {
  return {
    id,
    tagesdatensatz_id: recordId,
    state: "entwurf",
    kind: input.proposedKind,
    corrects_part_id: input.correctsPartId ?? null,
    occurred_at: input.occurredAt,
    documented_at: "server",
    confirmed_at: null,
    source_confirmed_at: null,
    staff_initials: null,
    room_version_id: input.roomId,
    template_id: input.templateId,
    treatment_type: input.treatmentType ?? null,
    appointment_type: input.appointmentType ?? null,
    text: input.text,
    teeth: input.teeth,
    variables: input.variables,
    selection: input.selection,
    positions: input.positions,
    source_entry_id: null,
    source_entry_version: null,
    source_ivoris_push_status: null,
    decision_reason: null,
  };
}

function normalizedRuleKey(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() : "";
}

async function enrichInputPositions(db: Db, input: AddDayPartRequest): Promise<AddDayPartRequest> {
  if (!input.treatmentType || !input.appointmentType) return input;
  const slugs = input.appointmentType.split("+").filter(Boolean);
  const { data, error } = await db.from("doku_vorlagen")
    .select("id,termin_typ,positionen")
    .eq("aktiv", true)
    .eq("behandlungsart", input.treatmentType)
    .in("termin_typ", slugs);
  if (error) dbError(error, "Vorlagenpositionen konnten nicht geprüft werden.");
  const rules: Array<Record<string, unknown> & { module: string }> = [];
  for (const template of data ?? []) {
    const module = String(template.termin_typ ?? "");
    const selected = (input.selection[module] ?? input.selection) as Record<string, unknown>;
    for (const rawRule of Array.isArray(template.positionen) ? template.positionen : []) {
      if (!rawRule || typeof rawRule !== "object") continue;
      const rule = rawRule as Record<string, unknown>;
      const condition = rule.if as { g?: unknown; i?: unknown } | undefined;
      if (condition) {
        const indices = selected[String(condition.g)] as unknown;
        if (!Array.isArray(indices) || !indices.includes(condition.i)) continue;
      }
      rules.push({ ...rule, module });
    }
  }
  const consumed = new Set<number>();
  const positions = input.positions.map(position => {
    const positionCode = normalizedRuleKey(position.code).replace(/\s/g, "");
    const positionText = normalizedRuleKey(position.text);
    const index = rules.findIndex((rule, ruleIndex) => !consumed.has(ruleIndex)
      && normalizedRuleKey(rule.code).replace(/\s/g, "") === positionCode
      && normalizedRuleKey(rule.text) === positionText);
    const rule = index >= 0 ? rules[index] : null;
    if (index >= 0) consumed.add(index);
    const group = rule && typeof (rule.if as { g?: unknown } | undefined)?.g === "string"
      ? String((rule.if as { g: string }).g)
      : "";
    const jaw = group.endsWith("_ok") ? "OK" : group.endsWith("_uk") ? "UK" : position.jaw ?? position.kiefer ?? null;
    const toothBound = rule?.count === "zaehne" || /(?:126|6100|6110|6120|6130|ROEHR|BRACKET|ATTACHMENT|BAND|KNOPF)/i.test(position.code);
    return {
      ...position,
      quantity: position.quantity ?? position.anzahl,
      jaw,
      teeth: toothBound ? input.teeth : position.teeth ?? position.zaehne ?? [],
    };
  });
  return { ...input, positions };
}

function acceptedParts(parts: StoredDayPart[], proposed?: StoredDayPart) {
  const confirmed = [...parts.filter(part => part.state === "bestaetigt"), ...(proposed ? [proposed] : [])];
  const replacedPartIds = new Set(confirmed
    .filter(part => part.kind === "korrektur" && part.corrects_part_id)
    .map(part => part.corrects_part_id as string));
  return confirmed.filter(part => !replacedPartIds.has(part.id));
}

function resultingClinicalText(parts: StoredDayPart[]) {
  return parts.map(part => part.text.trim()).filter(Boolean).join("\n\n");
}

function previewValue(record: StoredDayRecord, parts: StoredDayPart[], proposed: StoredDayPart) {
  const included = acceptedParts(parts, proposed);
  const merge = mergeDayPositions(included.map(part => ({ id: part.id, positions: part.positions })));
  const sourceAlreadyPushed = proposed.source_entry_id !== null
    && proposed.source_entry_id !== record.canonical_entry_id
    && proposed.source_ivoris_push_status === "gepusht";
  const payload = {
    dayRecordId: record.id,
    basedOnVersion: record.version,
    proposedPart: {
      id: proposed.id,
      kind: proposed.kind,
      correctsPartId: proposed.corrects_part_id,
      occurredAt: proposed.occurred_at,
      documentedAt: null,
      confirmedAt: null,
      roomId: proposed.room_version_id,
      templateId: proposed.template_id,
      text: proposed.text,
      teeth: proposed.teeth,
      positions: proposed.positions,
    },
    resultingPositions: merge.positions,
    conflicts: merge.conflicts,
    clinicalConfirmationAllowed: true,
    billingClarificationRequired: merge.conflicts.length > 0,
    ivoris: {
      action: sourceAlreadyPushed ? "already_pushed" : proposed.kind === "korrektur" ? "append_korrektur" : "append_nachtrag",
      heading: sourceAlreadyPushed ? null : proposed.kind === "korrektur" ? "KORREKTUR" : "NACHTRAG",
      text: sourceAlreadyPushed ? null : proposed.text,
      includesOnlyNewPart: true,
      repeatsPreviouslyPushedText: false,
      originalPartId: proposed.corrects_part_id,
    },
    resultingClinicalText: resultingClinicalText(included),
  };
  return { ...payload, previewToken: buildDayPreviewToken(payload) };
}

export async function previewNewDayPart(db: Db, id: string, raw: unknown) {
  const parsed = addDayPartRequestSchema.safeParse(raw);
  if (!parsed.success) throw new DayRecordError("day_part_invalid", 422, parsed.error.issues[0]?.message ?? "Ergänzung ist ungültig.");
  const input = await enrichInputPositions(db, parsed.data);
  const { record, parts } = await readDayRecord(db, id);
  if (record.version !== input.expectedVersion) throw new DayRecordError("day_version_conflict", 409, "Der Tagesdatensatz wurde inzwischen geändert.");
  const occurredDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(input.occurredAt));
  if (occurredDate !== record.service_date) {
    throw new DayRecordError("occurred_at_wrong_day", 422, "Die Behandlungszeit gehört nicht zu diesem Behandlungstag.");
  }
  if (input.correctsPartId && !parts.some(part => part.id === input.correctsPartId && part.state === "bestaetigt")) {
    throw new DayRecordError("corrected_part_not_found", 422, "Der zu korrigierende Tagesabschnitt wurde nicht gefunden.");
  }
  return previewValue(record, parts, partFromInput("00000000-0000-4000-8000-000000000000", id, input));
}

export async function saveDraftDayPart(db: Db, id: string, raw: unknown, previewToken: string | null) {
  const preview = await previewNewDayPart(db, id, raw);
  if (!previewToken || preview.previewToken !== previewToken) {
    throw new DayRecordError("day_preview_stale", 409, "Die Vorschau ist nicht mehr aktuell. Bitte erneut prüfen.");
  }
  const input = addDayPartRequestSchema.parse(raw);
  const { data, error } = await db.from("doku_tagesdatensatz_teile").insert({
    tagesdatensatz_id: id,
    state: "entwurf",
    kind: input.proposedKind,
    corrects_part_id: input.correctsPartId ?? null,
    occurred_at: input.occurredAt,
    room_version_id: input.roomId,
    template_id: input.templateId,
    treatment_type: input.treatmentType ?? null,
    appointment_type: input.appointmentType ?? null,
    text: input.text,
    teeth: input.teeth,
    variables: input.variables,
    selection: input.selection,
    positions: preview.proposedPart.positions,
  }).select("*").single();
  if (error || !data) dbError(error, "Entwurfsteil konnte nicht gespeichert werden.");
  const current = await readDayRecord(db, id);
  const stored = data as StoredDayPart;
  return {
    part: stored,
    decisionPreview: previewValue(current.record, current.parts.filter(part => part.id !== stored.id), stored),
  };
}

const decisionPreviewSchema = z.object({
  decision: z.enum(["nachtrag", "korrektur"]),
  correctsPartId: z.string().uuid().nullish(),
}).superRefine((value, ctx) => {
  if (value.decision === "korrektur" && !value.correctsPartId)
    ctx.addIssue({code:z.ZodIssueCode.custom,path:["correctsPartId"],message:"corrected_part_not_found"});
});

function decisionPart(part: StoredDayPart, parts: StoredDayPart[], raw: unknown): StoredDayPart {
  const parsed = decisionPreviewSchema.safeParse(raw);
  if (!parsed.success) throw new DayRecordError("day_part_decision_invalid",422,"Entscheidung oder Korrekturbezug ist ungültig.");
  const target = parsed.data.decision === "korrektur" ? parsed.data.correctsPartId! : null;
  if (target && !parts.some(p => p.id === target && p.state === "bestaetigt" && p.tagesdatensatz_id === part.tagesdatensatz_id))
    throw new DayRecordError("corrected_part_not_found",422,"Der zu korrigierende Tagesabschnitt wurde nicht gefunden.");
  return {...part,kind:parsed.data.decision,corrects_part_id:target};
}

export async function previewStoredDayPart(db: Db, id: string, partId: string, raw?: unknown) {
  const { record, parts } = await readDayRecord(db, id);
  const part = parts.find(value => value.id === partId);
  if (!part || part.state !== "entwurf") throw new DayRecordError("draft_part_not_found", 404, "Entwurfsteil nicht gefunden.");
  // Legacy callers may preview a stored non-null decision. Bootstrap drafts must choose one.
  const proposed = decisionPart(part,parts,raw ?? {decision:part.kind,correctsPartId:part.corrects_part_id});
  return previewValue(record, parts.filter(value => value.id !== partId), proposed);
}

export async function decideStoredDayPart(db: Db, id: string, partId: string, raw: unknown,actor?:{id:string;name:string}) {
  const parsed = decideDayPartRequestSchema.safeParse(raw);
  if (!parsed.success) throw new DayRecordError("day_part_decision_invalid", 422, parsed.error.issues[0]?.message ?? "Entscheidung ist ungültig.");
  const input: DecideDayPartRequest = parsed.data;
  const { record, parts } = await readDayRecord(db, id);
  if (record.version !== input.expectedVersion) throw new DayRecordError("day_version_conflict", 409, "Der Tagesdatensatz wurde inzwischen geändert.");
  const part = parts.find(value => value.id === partId);
  if (!part || part.state !== "entwurf") throw new DayRecordError("draft_part_not_found", 404, "Entwurfsteil nicht gefunden.");

  if (input.decision === "verwerfen") {
    const { data, error } = await db.rpc("decide_doku_day_part", {
      p_day_id: id,
      p_part_id: partId,
      p_expected_version: input.expectedVersion,
      p_decision: input.decision,
      p_reason: input.reason,
      p_corrects_part_id: null,
      p_resulting_text: null,
      p_resulting_positions: [],
      p_conflicts: [],
      p_ivoris_delta_text: null,
      p_consistency_audit: null,
    });
    if (error) dbError(error, "Entwurfsteil konnte nicht verworfen werden.");
    return data;
  }

  const proposed = decisionPart(part, parts, input);
  let acknowledgement:ConsistencyAudit|null=null;
  if (part.template_id && part.treatment_type && part.appointment_type) {
    const consistencyInput={
      vorlage_id: part.template_id,
      behandlungsart: part.treatment_type,
      termin_typ: part.appointment_type,
      text: part.text,
      auswahl: part.selection,
      variablen: part.variables,
      zaehne: part.teeth,
      positionen: part.positions.map(rawPosition => {
        const position = rawPosition as Record<string, unknown>;
        return { code: position.code, text: position.text, anzahl: position.anzahl ?? position.quantity };
      }),
      consistencyAcknowledgement:input.consistencyAcknowledgement,
    };
    const consistency = await checkScribeConsistency(db,consistencyInput);
    if (!consistency.canConfirm) {
      if(actor&&isConsistencyAcknowledged(consistencyInput,consistency))acknowledgement=consistencyAudit(consistencyInput,consistency,actor);
      else{
       const unavailable = consistency.issues.some(issue => issue.scope === "source");
       throw new DayRecordError("consistency_confirmation_required", unavailable ? 503 : 422,
         unavailable ? "Prüfgrundlage ist derzeit nicht verfügbar." : "Der Entwurfsteil muss vor dem Bestätigen geprüft werden.",
         {consistency,confirmation:consistencyConfirmation(consistencyInput,consistency)});
      }
    }
  }
  const preview = previewValue(record, parts.filter(value => value.id !== partId), proposed);
  if (preview.previewToken !== input.previewToken) {
    throw new DayRecordError("day_preview_stale", 409, "Die Vorschau ist nicht mehr aktuell. Bitte erneut prüfen.");
  }

  const { data, error } = await db.rpc("decide_doku_day_part", {
    p_day_id: id,
    p_part_id: partId,
    p_expected_version: input.expectedVersion,
    p_decision: input.decision,
    p_reason: input.reason,
    p_corrects_part_id: proposed.corrects_part_id,
    p_resulting_text: preview.resultingClinicalText,
    p_resulting_positions: preview.resultingPositions.map(position => ({
      code: position.code,
      text: position.text,
      anzahl: position.quantity,
      jaw: position.jaw,
      teeth: position.teeth,
      sourcePartIds: position.sourcePartIds,
    })),
    p_conflicts: preview.conflicts,
    p_ivoris_delta_text: part.text,
    // The audit travels through the same SECURITY DEFINER decision as the
    // canonical content update. A second service-role write would trip 076.
    p_consistency_audit: acknowledgement,
  });
  if (error) dbError(error, "Entwurfsteil konnte nicht bestätigt werden.");
  const auditStored=!!acknowledgement;
  return {result:data,preview,...(acknowledgement?{confirmation:acknowledgement,confirmationLabel:`Trotz Hinweis von ${acknowledgement.confirmedBy.name} bestätigt`,auditStored}: {})};
}
