import { assessBillingCase, billingDate, scribeBillingCandidates, type ScribeBillingEntry } from "./billing-foundation";
import { effektiveStufe, type ProfilPermissions } from "./permissions";
import type { AppRole } from "./auth";

export function canReadBilling(role: AppRole | null, permissions: ProfilPermissions) {
  return role !== null && role !== "patient" && effektiveStufe(role, permissions, "rechnungen") !== "keine";
}

export function previousBillingQuarter(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const start = new Date(Date.UTC(year, Math.floor((month - 1) / 3) * 3 - 3, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function validBillingPeriod(from: string, to: string) {
  return billingDate.safeParse(from).success && billingDate.safeParse(to).success &&
    from <= to && Date.parse(to) - Date.parse(from) <= 366 * 86_400_000;
}

export async function loadScribeReadiness(
  patientId: string, from: string, to: string,
  readPage: (offset: number, limit: number) => Promise<ScribeBillingEntry[]>,
) {
  if (!validBillingPeriod(from, to)) throw new Error("invalid_period");
  const entries: ScribeBillingEntry[] = [];
  const ids = new Set<string>();
  const pageSize = 250;
  for (let offset = 0; ; offset += pageSize) {
    const page = await readPage(offset, pageSize);
    if (!Array.isArray(page) || page.length > pageSize) throw new Error("invalid_source_response");
    if (offset >= 10_000 && page.length) throw new Error("source_limit_exceeded");
    for (const entry of page) {
      if (entry.patient_id !== patientId || entry.termin_datum < from || entry.termin_datum > to) throw new Error("source_scope_mismatch");
      if (ids.has(entry.id)) throw new Error("source_changed_during_read");
      ids.add(entry.id);
      entries.push(entry);
    }
    if (page.length < pageSize) break;
  }
  const candidates = scribeBillingCandidates(entries);
  const assessment = assessBillingCase({
    patientId, from, to, insurerId: null, patientShareBasisPoints: null,
    shareSourceReference: null, expectedPatientCents: null, scopeConfirmed: false,
  }, candidates.lines);
  return {
    ...assessment, source: "scribe_only" as const, sourceReadComplete: true,
    clinicalEntryCount: entries.length,
    entriesWithoutPositions: candidates.entriesWithoutPositions.length,
    period: { from, to },
  };
}
