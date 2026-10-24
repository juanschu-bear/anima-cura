import { z } from "zod";
import { billingDate } from "./billing-foundation";

const supportedShare = z.union([z.literal(1000), z.literal(2000), z.literal(10000)]);

export const payerAllocationInput = z.object({
  patientId: z.string().uuid(),
  from: billingDate,
  to: billingDate,
  serviceVersionIds: z.array(z.string().uuid()).min(1).max(500),
  payerModel: z.enum(["private_full", "statutory_share"]),
  patientShareBasisPoints: supportedShare,
  shareSourceReference: z.string().trim().min(3).max(1000),
  expectedPatientCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(value => value.from <= value.to, { path: ["to"] }).superRefine((value, context) => {
  if (new Set(value.serviceVersionIds).size !== value.serviceVersionIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceVersionIds"], message: "duplicate_service_version" });
  }
  if (value.payerModel === "private_full" && value.patientShareBasisPoints !== 10000) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["patientShareBasisPoints"], message: "private_share_must_be_full" });
  }
  if (value.payerModel === "statutory_share" && ![1000, 2000].includes(value.patientShareBasisPoints)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["patientShareBasisPoints"], message: "statutory_share_invalid" });
  }
});

export type PayerAllocationInput = z.infer<typeof payerAllocationInput>;

const reason = z.string().trim().min(3).max(1000);
export const payerAllocationCommand = z.union([
  z.object({
    action: z.literal("save_payer"),
    caseId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    reason,
    data: payerAllocationInput,
  }).strict(),
  z.object({
    action: z.enum(["approve_payer", "withdraw_payer"]),
    versionId: z.string().uuid(),
    reason,
  }).strict(),
]);

export type ApprovedBillingLine = {
  versionId: string;
  patientId: string;
  serviceDate: string;
  schedule: "BEMA" | "GOZ" | "LABOR" | "MATERIAL";
  grossCents: number;
  approved: boolean;
  current: boolean;
};

function roundedShare(totalCents: number, basisPoints: number) {
  return Number((BigInt(totalCents) * BigInt(basisPoints) + BigInt(5000)) / BigInt(10000));
}

/**
 * Final patient-debt gate. Professional approval of a service proves the
 * service value only; this separate check proves who owes which amount.
 */
export function assessPayerAllocation(
  raw: unknown,
  lines: ApprovedBillingLine[],
  allApprovedCurrentVersionIds: string[],
) {
  const parsed = payerAllocationInput.safeParse(raw);
  if (!parsed.success) return { ok: false as const, issues: ["invalid_allocation"], patientCents: null, grossCents: null };
  const input = parsed.data;
  const issues: string[] = [];
  const requested = new Set(input.serviceVersionIds);
  const complete = new Set(allApprovedCurrentVersionIds);
  if (requested.size !== complete.size || Array.from(requested).some(id => !complete.has(id))) issues.push("scope_mismatch");
  if (lines.length !== requested.size || lines.some(line => !requested.has(line.versionId))) issues.push("line_set_mismatch");
  if (lines.some(line => line.patientId !== input.patientId)) issues.push("patient_mismatch");
  if (lines.some(line => line.serviceDate < input.from || line.serviceDate > input.to)) issues.push("outside_period");
  if (lines.some(line => !line.approved || !line.current)) issues.push("service_not_current");
  if (lines.some(line => !Number.isSafeInteger(line.grossCents) || line.grossCents <= 0)) issues.push("invalid_amount");
  if (input.payerModel === "private_full" && lines.some(line => line.schedule === "BEMA")) issues.push("bema_not_private_full");
  if (input.payerModel === "statutory_share" && lines.some(line => line.schedule !== "BEMA")) issues.push("mixed_share_unsupported");
  const grossCents = issues.includes("invalid_amount") ? null : lines.reduce((sum, line) => sum + line.grossCents, 0);
  if (grossCents !== null && !Number.isSafeInteger(grossCents)) issues.push("amount_overflow");
  const patientCents = grossCents === null ? null : roundedShare(grossCents, input.patientShareBasisPoints);
  if (patientCents !== input.expectedPatientCents) issues.push("expected_total_mismatch");
  return {
    ok: issues.length === 0,
    issues: Array.from(new Set(issues)),
    grossCents,
    patientCents,
  };
}
