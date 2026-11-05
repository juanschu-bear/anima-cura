import { createHash } from "node:crypto";
import { z } from "zod";

const jawSchema = z.enum(["OK", "UK", "both"]);
const toothSchema = z.string().regex(/^[1-8][1-8]$/);

export const dayPositionInputSchema = z.object({
  code: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(2000),
  quantity: z.number().int().positive().max(10000).optional(),
  anzahl: z.number().int().positive().max(10000).optional(),
  jaw: jawSchema.nullish(),
  kiefer: jawSchema.nullish(),
  teeth: z.array(toothSchema).max(52).optional(),
  zaehne: z.array(toothSchema).max(52).optional(),
}).refine(value => value.quantity !== undefined || value.anzahl !== undefined, {
  message: "quantity oder anzahl fehlt",
});

export type DayPositionInput = z.infer<typeof dayPositionInputSchema>;
export type DayJaw = z.infer<typeof jawSchema>;

export type DayPositionCandidate = {
  id: string;
  code: string;
  text: string;
  quantity: number;
  jaw: DayJaw | null;
  teeth: string[];
  sourcePartId: string;
  sourcePositionIndex: number;
  sourcePartIds: string[];
};

export type DayPositionConflictKind =
  | "same_tooth"
  | "same_jaw"
  | "jaw_overlap"
  | "variant_conflict"
  | "quantity_ambiguous"
  | "repeated_service";

export type DayPositionConflict = {
  id: string;
  kind: DayPositionConflictKind;
  code: string;
  sourcePartIds: string[];
  message: string;
  candidates: DayPositionCandidate[];
};

export type DayPositionMerge = {
  positions: DayPositionCandidate[];
  conflicts: DayPositionConflict[];
};

export type DayPartForMerge = {
  id: string;
  positions: unknown;
};

const normalizeCode = (value: string) => value.normalize("NFKC").toUpperCase().replace(/\s+/g, " ").trim();
const codeWithoutSystem = (value: string) => normalizeCode(value).replace(/^(?:BEMA|GOZ)\s+/, "").replace(/\s/g, "");
const flatFamily = (code: string) => /^(?:119(?:\/120|[A-D])|120[A-D])$/.test(codeWithoutSystem(code));
const wireCode = (code: string) => /^(?:127[AB]|128[ABC]|6140|6150)$/.test(codeWithoutSystem(code));
const diagnosticCode = (code: string) => /^(?:OPG|FRS|SCAN|FOTO(?:S)?)$/.test(codeWithoutSystem(code));

function allowedWireCombination(left: string, right: string) {
  const pair = [codeWithoutSystem(left), codeWithoutSystem(right)].sort().join("+");
  return pair === "128A+128C" || pair === "128B+128C";
}

function jawsOverlap(left: DayJaw | null, right: DayJaw | null) {
  if (!left || !right) return left === right;
  return left === "both" || right === "both" || left === right;
}

function stableId(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

function normalizePosition(raw: unknown, sourcePartId: string, sourcePositionIndex: number): DayPositionCandidate | null {
  const parsed = dayPositionInputSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  const jaw = value.jaw ?? value.kiefer ?? null;
  const teeth = Array.from(new Set(value.teeth ?? value.zaehne ?? [])).sort();
  const code = normalizeCode(value.code);
  const quantity = value.quantity ?? value.anzahl!;
  return {
    id: stableId([sourcePartId, sourcePositionIndex, code, jaw, teeth, quantity]),
    code,
    text: value.text.trim(),
    quantity,
    jaw,
    teeth,
    sourcePartId,
    sourcePositionIndex,
    sourcePartIds: [sourcePartId],
  };
}

function conflictMessage(kind: DayPositionConflictKind, position: DayPositionCandidate) {
  if (kind === "same_tooth") return `Die Position ${position.code} betrifft denselben Zahn mehrfach.`;
  if (kind === "same_jaw") return `Die Position ${position.code} betrifft denselben Kiefer mehrfach.`;
  if (kind === "jaw_overlap") return `Die Kieferangaben der Position ${position.code} überschneiden sich.`;
  if (kind === "variant_conflict") return `Für denselben Bereich sind alternative Positionsvarianten dokumentiert.`;
  if (kind === "quantity_ambiguous") return `Die Menge der Position ${position.code} ist nicht eindeutig.`;
  return `Die Leistung ${position.code} ist am selben Tag mehrfach dokumentiert.`;
}

function makeConflict(kind: DayPositionConflictKind, candidates: DayPositionCandidate[]): DayPositionConflict {
  const sourcePartIds = Array.from(new Set(candidates.flatMap(candidate => candidate.sourcePartIds))).sort();
  const code = Array.from(new Set(candidates.map(candidate => candidate.code))).join(" / ");
  return {
    id: stableId([kind, candidates.map(candidate => candidate.id).sort()]),
    kind,
    code,
    sourcePartIds,
    message: conflictMessage(kind, candidates[0]),
    candidates,
  };
}

function pairConflict(left: DayPositionCandidate, right: DayPositionCandidate): DayPositionConflictKind | null {
  const sameCode = codeWithoutSystem(left.code) === codeWithoutSystem(right.code);
  const sharedTeeth = left.teeth.filter(tooth => right.teeth.includes(tooth));
  if (sharedTeeth.length) return "same_tooth";

  if (wireCode(left.code) && wireCode(right.code) && jawsOverlap(left.jaw, right.jaw)) {
    if (sameCode) return left.jaw === "both" || right.jaw === "both" ? "jaw_overlap" : "same_jaw";
    if (allowedWireCombination(left.code, right.code)) return null;
    return "variant_conflict";
  }
  if (flatFamily(left.code) && flatFamily(right.code) && jawsOverlap(left.jaw, right.jaw)) {
    if (!sameCode) return "variant_conflict";
    if (left.quantity !== right.quantity) return "quantity_ambiguous";
    return null;
  }
  if (sameCode && left.jaw && right.jaw && jawsOverlap(left.jaw, right.jaw)) {
    return left.jaw === "both" || right.jaw === "both" ? "jaw_overlap" : "same_jaw";
  }
  if (sameCode && diagnosticCode(left.code)) return "repeated_service";
  if (sameCode && !left.teeth.length && !right.teeth.length && !left.jaw && !right.jaw) return "repeated_service";
  return null;
}

/**
 * Merges the positions of one clinical day. Only an identical flat-rate line
 * may collapse automatically. Every clinically localised overlap becomes an
 * accounting clarification; it never blocks the clinical record.
 */
export function mergeDayPositions(parts: DayPartForMerge[]): DayPositionMerge {
  const candidates: DayPositionCandidate[] = [];
  for (const part of parts) {
    if (!Array.isArray(part.positions)) continue;
    part.positions.forEach((position, index) => {
      const normalized = normalizePosition(position, part.id, index);
      if (normalized) candidates.push(normalized);
    });
  }

  // A retried transport of the exact same part/position is technical
  // idempotency, not a second clinical service.
  const unique = Array.from(new Map(candidates.map(candidate => [candidate.id, candidate])).values());
  const collapsed: DayPositionCandidate[] = [];
  for (const candidate of unique) {
    const existing = collapsed.find(position =>
      flatFamily(position.code) && flatFamily(candidate.code) &&
      codeWithoutSystem(position.code) === codeWithoutSystem(candidate.code) &&
      position.jaw === candidate.jaw && position.quantity === candidate.quantity
    );
    if (!existing) collapsed.push(candidate);
    else existing.sourcePartIds = Array.from(new Set([...existing.sourcePartIds, ...candidate.sourcePartIds])).sort();
  }

  const conflicted = new Set<string>();
  const conflicts: DayPositionConflict[] = [];
  for (let leftIndex = 0; leftIndex < collapsed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < collapsed.length; rightIndex += 1) {
      const left = collapsed[leftIndex];
      const right = collapsed[rightIndex];
      const kind = pairConflict(left, right);
      if (!kind) continue;
      const conflict = makeConflict(kind, [left, right]);
      if (!conflicts.some(existing => existing.id === conflict.id)) conflicts.push(conflict);
      conflicted.add(left.id);
      conflicted.add(right.id);
    }
  }

  return {
    positions: collapsed.filter(position => !conflicted.has(position.id)),
    conflicts,
  };
}

export function buildDayPreviewToken(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const addDayPartRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  proposedKind: z.enum(["nachtrag", "korrektur"]),
  correctsPartId: z.string().uuid().nullish(),
  occurredAt: z.string().datetime({ offset: true }),
  roomId: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
  treatmentType: z.string().trim().min(1).max(200).nullable().optional(),
  appointmentType: z.string().trim().min(1).max(2000).nullable().optional(),
  text: z.string().trim().min(1).max(50000),
  teeth: z.array(toothSchema).max(52).default([]),
  variables: z.record(z.unknown()).default({}),
  selection: z.record(z.unknown()).default({}),
  positions: z.array(dayPositionInputSchema).max(500).default([]),
}).superRefine((value, context) => {
  if (value.proposedKind === "korrektur" && !value.correctsPartId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["correctsPartId"], message: "Korrektur benötigt den ursprünglichen Teil." });
  }
});

export type AddDayPartRequest = z.infer<typeof addDayPartRequestSchema>;

export const decideDayPartRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["nachtrag", "korrektur", "verwerfen"]),
  reason: z.string().trim().min(3).max(2000),
  correctsPartId: z.string().uuid().nullish(),
  previewToken: z.string().regex(/^[a-f0-9]{64}$/).nullish(),
}).superRefine((value, context) => {
  if (value.decision === "korrektur" && !value.correctsPartId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["correctsPartId"], message: "Korrektur benötigt den ursprünglichen Teil." });
  }
  if (value.decision !== "verwerfen" && !value.previewToken) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["previewToken"], message: "Aktuelle Vorschau fehlt." });
  }
});

export type DecideDayPartRequest = z.infer<typeof decideDayPartRequestSchema>;
