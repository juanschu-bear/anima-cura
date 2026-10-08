import { z } from "zod";

// No live tariffs or default prices: callers must supply a dated, sourced version.
// This is a preflight contract, not an authorization to issue an invoice.
export const billingDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const decimal = z.string().regex(/^\d{1,9}(?:\.\d{1,7})?$/).refine((value) => Number(value) > 0);
const schedule = z.enum(["BEMA", "GOZ", "LABOR", "MATERIAL"]);
const source = z.object({
  system: z.enum(["scribe", "ivoris", "practice_import", "manual"]),
  recordId: z.string().min(1),
  version: z.number().int().positive(),
  positionIndex: z.number().int().nonnegative(),
}).strict();

export const tariffVersionSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().positive(),
  sourceReference: z.string().min(1),
  validFrom: billingDate,
  validTo: billingDate,
  schedule,
  code: z.string().min(1),
  insurerId: z.string().min(1).nullable(),
  requiresRegion: z.boolean(),
  price: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("points"), points: decimal, pointValueEuro: decimal }).strict(),
    z.object({ kind: z.literal("unit"), unitPriceEuro: decimal }).strict(),
  ]),
}).strict().refine((value) => value.validFrom <= value.validTo);

export const billingLineSchema = z.object({
  patientId: z.string().uuid(),
  source,
  serviceDate: billingDate,
  schedule,
  code: z.string().min(1),
  description: z.string().trim().min(1),
  quantity: z.number().int().positive().max(10_000),
  region: z.string().trim().min(1).nullable(),
  factor: decimal.nullable(),
  justification: z.string().trim().min(1).nullable(),
  billingConfirmedBy: z.string().uuid().nullable(),
  billingConfirmedAt: z.string().datetime({ offset: true }).nullable(),
  tariff: tariffVersionSchema.nullable(),
}).strict();

export type BillingLine = z.infer<typeof billingLineSchema>;
export type TariffVersion = z.infer<typeof tariffVersionSchema>;
export type BillingIssue = { code: string; lineIndex?: number; field?: string };
export type BillingCase = {
  patientId: string;
  from: string;
  to: string;
  insurerId: string | null;
  patientShareBasisPoints: 0 | 1000 | 2000 | 10000 | null;
  shareSourceReference: string | null;
  expectedPatientCents: number | null;
  scopeConfirmed: boolean;
};

function fraction(value: string): [bigint, bigint] {
  decimal.parse(value);
  const [whole, part = ""] = value.split(".");
  return [BigInt(whole + part), BigInt("1" + "0".repeat(part.length))];
}

function roundedRatio(numerator: bigint, denominator: bigint): number {
  const result = (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("amount_overflow");
  return Number(result);
}

/** Multiply exact decimal strings, round once to cents; never binary-float money. */
export function calculateLineCents(price: TariffVersion["price"], factor: string, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10_000) throw new Error("invalid_quantity");
  const values = price.kind === "points"
    ? [price.points, price.pointValueEuro, factor]
    : [price.unitPriceEuro, factor];
  let numerator = BigInt(100) * BigInt(quantity);
  let denominator = BigInt(1);
  for (const value of values) {
    const [n, d] = fraction(value);
    numerator *= n;
    denominator *= d;
  }
  return roundedRatio(numerator, denominator);
}

export function assessBillingCase(context: BillingCase, rawLines: unknown[]) {
  const issues: BillingIssue[] = [];
  const add = (code: string, lineIndex?: number, field?: string) => issues.push({ code, lineIndex, field });
  const contextValid = z.object({
    patientId: z.string().uuid(), from: billingDate, to: billingDate,
    insurerId: z.string().min(1).nullable(),
    patientShareBasisPoints: z.union([z.literal(0), z.literal(1000), z.literal(2000), z.literal(10000)]).nullable(),
    shareSourceReference: z.string().trim().min(1).nullable(),
    expectedPatientCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
    scopeConfirmed: z.boolean(),
  }).strict().safeParse(context);
  if (!contextValid.success || context.from > context.to) add("invalid_context");
  if (!context.scopeConfirmed) add("scope_unconfirmed");
  if (context.patientShareBasisPoints === null || !context.shareSourceReference) add("patient_share_missing");
  if (!rawLines.length) add("positions_missing");

  const sources = new Map<string, number>();
  const amounts: Array<number | null> = [];
  rawLines.forEach((raw, lineIndex) => {
    const parsed = billingLineSchema.safeParse(raw);
    if (!parsed.success) {
      for (const error of parsed.error.issues) add("invalid_field", lineIndex, error.path.join("."));
      amounts.push(null);
      return;
    }
    const line = parsed.data;
    const issueStart = issues.length;
    if (line.patientId !== context.patientId) add("patient_mismatch", lineIndex);
    if (line.serviceDate < context.from || line.serviceDate > context.to) add("outside_period", lineIndex);
    // A BEMA case share must not discount private GOZ fees in a mixed case.
    // Mixed payer contracts need per-line allocation before this is supported.
    if (line.schedule === "GOZ" && context.patientShareBasisPoints !== null && context.patientShareBasisPoints !== 10000) {
      add("share_allocation_unsupported", lineIndex);
    }
    const key = JSON.stringify([line.source.system, line.source.recordId, line.source.positionIndex]);
    if (sources.has(key)) add(sources.get(key) === line.source.version ? "duplicate_source" : "source_version_conflict", lineIndex);
    sources.set(key, line.source.version);

    const codeValid = line.schedule === "BEMA" ? /^\d{1,3}[a-z]?$/i.test(line.code)
      : line.schedule === "GOZ" ? /^\d{4}$/.test(line.code) : true;
    if (!codeValid) add("code_not_individual", lineIndex);
    if (!line.billingConfirmedBy || !line.billingConfirmedAt) add("billing_confirmation_missing", lineIndex);
    const tariff = line.tariff;
    if (!tariff) {
      add("tariff_missing", lineIndex);
    } else {
      if (tariff.schedule !== line.schedule || tariff.code !== line.code) add("tariff_mismatch", lineIndex);
      if (line.serviceDate < tariff.validFrom || line.serviceDate > tariff.validTo) add("tariff_expired", lineIndex);
      if (line.schedule === "BEMA" && (!context.insurerId || tariff.insurerId !== context.insurerId)) add("insurer_mismatch", lineIndex);
      if (tariff.requiresRegion && !line.region) add("region_missing", lineIndex);
      if (line.schedule === "GOZ" && tariff.price.kind !== "points") add("goz_point_basis_missing", lineIndex);
    }
    if (line.schedule === "GOZ" && !line.factor) add("factor_missing", lineIndex);
    if (line.schedule === "GOZ" && line.factor && Number(line.factor) > 2.3 && !line.justification) add("justification_missing", lineIndex);
    // Exceptional agreements need a separate supported contract, not a silent high factor.
    if (line.schedule === "GOZ" && line.factor && Number(line.factor) > 3.5) add("fee_agreement_review", lineIndex);
    if (line.schedule !== "GOZ" && line.factor && Number(line.factor) !== 1) add("unexpected_factor", lineIndex);
    if (issues.length !== issueStart || !tariff) {
      amounts.push(null);
    } else {
      try { amounts.push(calculateLineCents(tariff.price, line.factor ?? "1", line.quantity)); }
      catch { add("amount_overflow", lineIndex); amounts.push(null); }
    }
  });

  // Unknown/partial totals must not appear as zero or as a complete patient debt.
  let grossCents: number | null = null;
  let patientCents: number | null = null;
  if (contextValid.success && context.from <= context.to && amounts.length && amounts.every((amount) => amount !== null)) {
    const total = amounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
    if (!Number.isSafeInteger(total)) add("amount_overflow");
    else {
      grossCents = total;
      if (context.patientShareBasisPoints !== null && context.shareSourceReference) {
        patientCents = roundedRatio(BigInt(total) * BigInt(context.patientShareBasisPoints), BigInt(10_000));
      }
    }
  }
  if (patientCents !== null && context.expectedPatientCents !== null && patientCents !== context.expectedPatientCents) add("total_mismatch");
  return {
    status: issues.length ? "needs_review" as const : "ready_for_review" as const,
    issuanceAllowed: false as const,
    issues,
    lineCount: rawLines.length,
    grossCents,
    patientCents,
    differenceCents: patientCents !== null && context.expectedPatientCents !== null ? patientCents - context.expectedPatientCents : null,
    calculationPolicy: "round_line_gross_then_case_share_v1" as const,
  };
}

export type ScribeBillingEntry = {
  id: string; patient_id: string; version: number; termin_datum: string;
  status: string; bestaetigt_am: string | null; positionen: unknown;
};

/** A confirmed clinical note remains a billing proposal. Never infer price or approval. */
export function scribeBillingCandidates(entries: ScribeBillingEntry[]) {
  const lines: unknown[] = [];
  const entriesWithoutPositions: string[] = [];
  for (const entry of entries) {
    if (entry.status !== "bestaetigt" || !entry.bestaetigt_am) continue;
    if (!Array.isArray(entry.positionen) || !entry.positionen.length) {
      entriesWithoutPositions.push(entry.id);
      continue;
    }
    entry.positionen.forEach((raw: unknown, positionIndex: number) => {
      const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
      const code = typeof value.code === "string" ? value.code.trim() : "";
      const match = /^(BEMA|GOZ)\s+(.+)$/i.exec(code);
      lines.push({
        patientId: entry.patient_id,
        source: { system: "scribe", recordId: entry.id, version: entry.version, positionIndex },
        serviceDate: entry.termin_datum,
        schedule: match ? match[1].toUpperCase() : null,
        code: match ? match[2] : code,
        description: typeof value.text === "string" ? value.text.trim() : "",
        // Preserve malformed/missing quantities as missing, never silently default to 1.
        quantity: typeof value.anzahl === "number" ? value.anzahl : null,
        region: null, factor: null, justification: null,
        billingConfirmedBy: null, billingConfirmedAt: null, tariff: null,
      });
    });
  }
  return { lines, entriesWithoutPositions };
}

/** Clipboard export is all-or-nothing; never invent quantity=1 or drop bad lines. */
export function prepareScribeBillingExport(raw: unknown) {
  const schema = z.array(z.object({
    code: z.string().trim().regex(/^(?:BEMA\s+\d{1,3}[a-z]?|GOZ\s+\d{4})$/i),
    text: z.string().trim().min(1).refine((value) => !/[\r\n\t]/.test(value)),
    anzahl: z.number().int().positive().max(10_000),
  })).min(1);
  const result = schema.safeParse(raw);
  if (!result.success) return { ok: false as const, positions: [], copyText: "" };
  return {
    ok: true as const, positions: result.data,
    copyText: result.data.map((position) => `${position.code}${position.anzahl > 1 ? ` x${position.anzahl}` : ""}\t${position.text}`).join("\n"),
  };
}
