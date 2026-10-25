import { resolveOpenItemAmount, resolveOpenItemStatus, resolvePaidItemAmount } from "./open-items";

type RateLike = {
  betrag?: number | string | null;
  bezahlt_betrag?: number | string | null;
  status?: string | null;
  mahnstufe?: number | null;
};

function cents(value: number | string | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0;
}

export function resolveRateAmounts(rate: RateLike) {
  if (rate.status === "storniert" || rate.status === "erloesminderung") {
    return { paid: 0, open: 0 };
  }
  const amount = cents(rate.betrag);
  const paid = rate.bezahlt_betrag == null
    ? (rate.status === "bezahlt" ? amount : 0)
    : cents(rate.bezahlt_betrag);
  return { paid: paid / 100, open: Math.max(0, amount - paid) / 100 };
}

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
  rates = rates.filter((rate) => rate.status !== "storniert" && rate.status !== "erloesminderung");
  const paidCount = rates.filter((rate) => rate.status === "bezahlt").length;
  const partialCount = rates.filter((rate) => rate.status === "teilbezahlt").length;
  const restschuld = rates.reduce((sum, rate) => sum + cents(resolveRateAmounts(rate).open), 0) / 100;
  const bezahltBetrag = rates.reduce((sum, rate) => sum + cents(resolveRateAmounts(rate).paid), 0) / 100;
  const outstanding = rates.filter((rate) => resolveRateAmounts(rate).open > 0);
  const hasOverdue = outstanding.some((rate) => rate.status === "überfällig" || rate.status === "ueberfaellig");
  const maxMahn = outstanding.reduce((max, rate) => Math.max(max, Number(rate.mahnstufe ?? 0)), 0);

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
  const confirmedItems = items.filter((item) => item.nicht_mahnen !== true
    && item.status !== "storniert" && item.status !== "erloesminderung");
  const paidCount = confirmedItems.filter((item) => resolveOpenItemStatus(item) === "bezahlt").length;
  const partialCount = confirmedItems.filter((item) => resolveOpenItemStatus(item) === "teilbezahlt").length;
  const hasOverdue = confirmedItems.some((item) => resolveOpenItemStatus(item) === "überfällig");
  const restschuld = confirmedItems.reduce((sum, item) => sum + cents(resolveOpenItemAmount(item)), 0) / 100;
  const bezahltBetrag = confirmedItems.reduce((sum, item) => sum + cents(resolvePaidItemAmount(item)), 0) / 100;

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
