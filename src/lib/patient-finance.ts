import { resolveOpenItemAmount, resolveOpenItemStatus, resolvePaidItemAmount } from "./open-items";

type RateLike = {
  betrag?: number | string | null;
  status?: string | null;
  mahnstufe?: number | null;
};

type OpenItemLike = {
  betrag?: number | null;
  offen?: number | null;
  gezahlt?: number | null;
  status?: string | null;
  nicht_mahnen?: boolean | null;
};

export type PatientFinanceSummary = {
  source: "open_items" | "rates" | "none";
  restschuld: number;
  bezahltBetrag: number;
  totalCount: number;
  paidCount: number;
  partialCount: number;
  hasOverdue: boolean;
  maxMahn: number;
  status: "pünktlich" | "abweichung" | "stufe1" | "verzug" | "eskalation";
};

function deriveStatus(hasOverdue: boolean, maxMahn: number): PatientFinanceSummary["status"] {
  if (maxMahn >= 3) return "eskalation";
  if (maxMahn === 2) return "verzug";
  if (maxMahn === 1) return "stufe1";
  if (hasOverdue) return "abweichung";
  return "pünktlich";
}

export function summarizeRates(rates: RateLike[]): PatientFinanceSummary {
  const paidCount = rates.filter((rate) => rate.status === "bezahlt").length;
  const partialCount = rates.filter((rate) => rate.status === "teilbezahlt").length;
  const restschuld = rates
    .filter((rate) => rate.status !== "bezahlt")
    .reduce((sum, rate) => sum + Number(rate.betrag ?? 0), 0);
  const bezahltBetrag = rates
    .filter((rate) => rate.status === "bezahlt" || rate.status === "teilbezahlt")
    .reduce((sum, rate) => sum + Number(rate.betrag ?? 0), 0);
  const hasOverdue = rates.some((rate) => rate.status === "überfällig");
  const maxMahn = rates.reduce((max, rate) => Math.max(max, Number(rate.mahnstufe ?? 0)), 0);

  return {
    source: "rates",
    restschuld,
    bezahltBetrag,
    totalCount: rates.length,
    paidCount,
    partialCount,
    hasOverdue,
    maxMahn,
    status: deriveStatus(hasOverdue, maxMahn),
  };
}

export function summarizeOpenItems(items: OpenItemLike[]): PatientFinanceSummary {
  // `nicht_mahnen=true` marks imported/reconciled records that are still under
  // review. They remain available to the matching engine, but must never be
  // presented to staff or patients as an established debt.
  const confirmedItems = items.filter((item) => item.nicht_mahnen !== true);
  const paidCount = confirmedItems.filter((item) => resolveOpenItemStatus(item) === "bezahlt").length;
  const partialCount = confirmedItems.filter((item) => resolveOpenItemStatus(item) === "teilbezahlt").length;
  const hasOverdue = confirmedItems.some((item) => resolveOpenItemStatus(item) === "überfällig");
  const restschuld = confirmedItems.reduce((sum, item) => sum + resolveOpenItemAmount(item), 0);
  const bezahltBetrag = confirmedItems.reduce((sum, item) => sum + resolvePaidItemAmount(item), 0);

  return {
    source: "open_items",
    restschuld,
    bezahltBetrag,
    totalCount: confirmedItems.length,
    paidCount,
    partialCount,
    hasOverdue,
    maxMahn: 0,
    status: deriveStatus(hasOverdue, 0),
  };
}

export function summarizePatientFinance({
  rates,
  openItems,
}: {
  rates?: RateLike[] | null;
  openItems?: OpenItemLike[] | null;
}): PatientFinanceSummary {
  const normalizedOpenItems = openItems ?? [];
  if (normalizedOpenItems.length > 0) {
    return summarizeOpenItems(normalizedOpenItems);
  }

  const normalizedRates = rates ?? [];
  if (normalizedRates.length > 0) {
    return summarizeRates(normalizedRates);
  }

  return {
    source: "none",
    restschuld: 0,
    bezahltBetrag: 0,
    totalCount: 0,
    paidCount: 0,
    partialCount: 0,
    hasOverdue: false,
    maxMahn: 0,
    status: "pünktlich",
  };
}
