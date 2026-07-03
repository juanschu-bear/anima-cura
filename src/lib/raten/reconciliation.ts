type Rhythmus = "monatlich" | "quartalsweise" | string | null | undefined;

export interface InstallmentPlanLike {
  id?: string | null;
  patient_id?: string | null;
  anzahl_raten?: number | null;
  rate_betrag?: number | null;
  start_datum?: string | null;
  rhythmus?: Rhythmus;
}

export interface StoredRateLike {
  id?: string | null;
  ratenplan_id?: string | null;
  rate_nummer?: number | null;
  betrag?: number | null;
  faellig_am?: string | null;
  status?: string | null;
  bezahlt_am?: string | null;
  bezahlt_betrag?: number | null;
  mahnstufe?: number | null;
  transaktion_id?: string | null;
}

export interface ConfirmedPaymentLike {
  id?: string | null;
  datum?: string | null;
  betrag?: number | null;
  verwendungszweck?: string | null;
}

export interface ReconciledInstallment {
  id: string | null;
  nummer: number;
  betrag: number;
  faellig: Date;
  geplantStatus: string;
  geplantBezahltAm: Date | null;
  geplantBezahltBetrag: number;
  zugeordnet: number;
  rechnerischBezahltAm: Date | null;
  zustand: "bezahlt" | "teilbezahlt" | "ueberfaellig" | "offen";
  offen: number;
}

export interface ReconciliationResult {
  installments: ReconciledInstallment[];
  anzahl: number;
  geplantBezahlt: number;
  rechnerischBezahlt: number;
  teilbezahlt: number;
  restschuld: number;
  guthaben: number;
  verarbeiteteZahlungen: number;
  verarbeiteteSumme: number;
}

export interface RatePaymentUpdate {
  id: string;
  status: "offen" | "teilbezahlt" | "bezahlt" | "überfällig";
  bezahlt_betrag: number;
  bezahlt_am: string | null;
  transaktion_id: string | null;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function toDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRhythmMonths(rhythmus?: Rhythmus) {
  return rhythmus === "quartalsweise" ? 3 : 1;
}

export function addPlanMonths(startISO: string, step: number, rhythmus?: Rhythmus) {
  const date = new Date(startISO);
  date.setMonth(date.getMonth() + step * getRhythmMonths(rhythmus));
  return isoDate(date);
}

export function buildGeneratedRates(plan: InstallmentPlanLike, patientId?: string) {
  const anzahl = Math.max(0, Number(plan.anzahl_raten) || 0);
  const rateBetrag = round2(Number(plan.rate_betrag) || 0);
  const start = plan.start_datum || new Date().toISOString().slice(0, 10);
  return Array.from({ length: anzahl }).map((_, index) => ({
    ratenplan_id: plan.id ?? null,
    patient_id: patientId ?? plan.patient_id ?? null,
    rate_nummer: index + 1,
    betrag: rateBetrag,
    faellig_am: addPlanMonths(start, index, plan.rhythmus),
    status: "offen",
    mahnstufe: 0,
  }));
}

function normalizeStoredRates(plan: InstallmentPlanLike, storedRates: StoredRateLike[] = []) {
  const rates = storedRates
    .filter((rate) => !plan.id || !rate.ratenplan_id || rate.ratenplan_id === plan.id)
    .sort((a, b) => (Number(a.rate_nummer) || 0) - (Number(b.rate_nummer) || 0));

  if (rates.length > 0) {
    return rates.map((rate, index) => ({
      id: rate.id ?? null,
      nummer: Number(rate.rate_nummer) || index + 1,
      betrag: round2(Number(rate.betrag) || 0),
      faellig_am: rate.faellig_am || addPlanMonths(plan.start_datum || new Date().toISOString().slice(0, 10), index, plan.rhythmus),
      status: rate.status || "offen",
      bezahlt_am: rate.bezahlt_am || null,
      bezahlt_betrag: round2(Number(rate.bezahlt_betrag) || 0),
      mahnstufe: Number(rate.mahnstufe) || 0,
    }));
  }

  return buildGeneratedRates(plan).map((rate) => ({
    id: null,
    nummer: Number(rate.rate_nummer) || 0,
    betrag: round2(Number(rate.betrag) || 0),
    faellig_am: rate.faellig_am || plan.start_datum || new Date().toISOString().slice(0, 10),
    status: "offen",
    bezahlt_am: null,
    bezahlt_betrag: 0,
    mahnstufe: 0,
  }));
}

export function reconcileInstallments(
  plan: InstallmentPlanLike,
  storedRates: StoredRateLike[] = [],
  payments: ConfirmedPaymentLike[] = [],
  today = new Date()
): ReconciliationResult {
  const normalizedRates = normalizeStoredRates(plan, storedRates);
  const installments = normalizedRates.map((rate) => ({
    id: rate.id,
    nummer: rate.nummer,
    betrag: round2(rate.betrag),
    faellig: toDate(rate.faellig_am) || new Date(),
    geplantStatus: rate.status,
    geplantBezahltAm: toDate(rate.bezahlt_am),
    geplantBezahltBetrag: round2(rate.bezahlt_betrag),
    zugeordnet: 0,
    rechnerischBezahltAm: null as Date | null,
    zustand: "offen" as ReconciledInstallment["zustand"],
    offen: round2(rate.betrag),
  }));

  const start = toDate(plan.start_datum);
  const since = start ? new Date(start) : null;
  if (since) since.setDate(since.getDate() - 31);

  const confirmed = payments
    .filter((payment) => Number(payment.betrag) > 0)
    .filter((payment) => {
      const date = toDate(payment.datum);
      if (!date || !since) return Boolean(date);
      return date >= since;
    })
    .sort((a, b) => {
      const left = toDate(a.datum)?.getTime() || 0;
      const right = toDate(b.datum)?.getTime() || 0;
      return left - right;
    });

  let cursor = 0;
  let guthaben = 0;
  let summe = 0;

  for (const payment of confirmed) {
    let remaining = round2(Number(payment.betrag) || 0);
    const paymentDate = toDate(payment.datum);
    summe += remaining;

    while (remaining > 0.009 && cursor < installments.length) {
      const current = installments[cursor];
      const offen = round2(current.betrag - current.zugeordnet);
      if (offen <= 0.009) {
        cursor += 1;
        continue;
      }

      const chunk = round2(Math.min(offen, remaining));
      current.zugeordnet = round2(current.zugeordnet + chunk);
      current.offen = round2(Math.max(0, current.betrag - current.zugeordnet));
      remaining = round2(remaining - chunk);

      if (current.offen <= 0.009) {
        current.offen = 0;
        current.rechnerischBezahltAm = paymentDate;
        cursor += 1;
      }
    }

    if (remaining > 0.009) {
      guthaben = round2(guthaben + remaining);
    }
  }

  let geplantBezahlt = 0;
  let rechnerischBezahlt = 0;
  let teilbezahlt = 0;
  let restschuld = 0;

  for (const installment of installments) {
    if (installment.geplantStatus === "bezahlt") geplantBezahlt += 1;
    if (installment.offen <= 0.009) {
      installment.zustand = "bezahlt";
      rechnerischBezahlt += 1;
    } else if (installment.zugeordnet > 0.009) {
      installment.zustand = "teilbezahlt";
      teilbezahlt += 1;
      restschuld = round2(restschuld + installment.offen);
    } else if (installment.faellig.getTime() < today.getTime()) {
      installment.zustand = "ueberfaellig";
      restschuld = round2(restschuld + installment.betrag);
    } else {
      installment.zustand = "offen";
      restschuld = round2(restschuld + installment.betrag);
    }
  }

  return {
    installments,
    anzahl: installments.length,
    geplantBezahlt,
    rechnerischBezahlt,
    teilbezahlt,
    restschuld,
    guthaben,
    verarbeiteteZahlungen: confirmed.length,
    verarbeiteteSumme: round2(summe),
  };
}

export function allocatePaymentToRates(
  storedRates: StoredRateLike[],
  amount: number,
  paymentDate: string,
  transactionId: string | null
) {
  const rates = storedRates
    .filter((rate) => rate.id)
    .filter((rate) => rate.status !== "bezahlt" && rate.status !== "storniert")
    .sort((a, b) => {
      const leftDate = toDate(a.faellig_am)?.getTime() || 0;
      const rightDate = toDate(b.faellig_am)?.getTime() || 0;
      if (leftDate !== rightDate) return leftDate - rightDate;
      return (Number(a.rate_nummer) || 0) - (Number(b.rate_nummer) || 0);
    });

  const updates: RatePaymentUpdate[] = [];
  let remaining = round2(amount);

  for (const rate of rates) {
    if (remaining <= 0.009) break;
    const original = round2(Number(rate.betrag) || 0);
    const existingPaid = round2(Number(rate.bezahlt_betrag) || 0);
    const due = round2(Math.max(0, original - existingPaid));
    if (due <= 0.009) continue;

    const allocation = round2(Math.min(due, remaining));
    const nextPaid = round2(existingPaid + allocation);
    const fullyPaid = nextPaid >= original - 0.009;

    updates.push({
      id: String(rate.id),
      status: fullyPaid ? "bezahlt" : "teilbezahlt",
      bezahlt_betrag: fullyPaid ? original : nextPaid,
      bezahlt_am: fullyPaid ? paymentDate : null,
      transaktion_id: transactionId,
    });

    remaining = round2(remaining - allocation);
  }

  return {
    updates,
    restbetrag: round2(Math.max(0, remaining)),
  };
}
