export type LedgerPatient = {
  id: string;
  ivorisNummer?: string | null;
  vorname: string;
  nachname: string;
};

export type LedgerInvoice = {
  id: string;
  patientId: string | null;
  reference?: string | null;
  invoiceNumber?: string | null;
};

export type LedgerTransaction = {
  id: string;
  amountCents: number;
  senderName?: string | null;
  purpose?: string | null;
  existingPatientId?: string | null;
};

export type LedgerEvidence = {
  kind: "patient_number" | "invoice_reference" | "invoice_number" | "exact_full_name";
  value: string;
  score: number;
};

export type LedgerCandidate = {
  patientId: string;
  amountCents: number;
  confidenceScore: number;
  state: "candidate" | "confirmed_auto";
  evidence: LedgerEvidence[];
  reason: string;
};

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(value: string | null | undefined) {
  return normalize(value).replace(/\s+/g, "");
}

function includesPhrase(haystack: string, phrase: string) {
  return phrase.length > 0 && (` ${haystack} `).includes(` ${phrase} `);
}

export function buildLedgerPatientCandidates(
  transaction: LedgerTransaction,
  patients: LedgerPatient[],
  invoices: LedgerInvoice[]
): LedgerCandidate[] {
  if (transaction.amountCents <= 0) return [];
  const text = normalize(`${transaction.senderName || ""} ${transaction.purpose || ""}`);
  const compactPurpose = compact(transaction.purpose);
  const byPatient = new Map<string, LedgerEvidence[]>();
  const add = (patientId: string | null, evidence: LedgerEvidence) => {
    if (!patientId) return;
    const current = byPatient.get(patientId) || [];
    if (!current.some((item) => item.kind === evidence.kind && item.value === evidence.value)) {
      current.push(evidence);
    }
    byPatient.set(patientId, current);
  };

  for (const patient of patients) {
    const number = String(patient.ivorisNummer || "").replace(/\D/g, "").padStart(8, "0");
    if (number !== "00000000" && new RegExp(`(?:^|\\D)${number}(?=\\D|$)`).test(String(transaction.purpose || "").replace(/\s+/g, ""))) {
      add(patient.id, { kind: "patient_number", value: number, score: 100 });
    }
    const forward = normalize(`${patient.vorname} ${patient.nachname}`);
    const reverse = normalize(`${patient.nachname} ${patient.vorname}`);
    if (includesPhrase(text, forward) || includesPhrase(text, reverse)) {
      add(patient.id, { kind: "exact_full_name", value: forward, score: 75 });
    }
  }

  for (const invoice of invoices) {
    const reference = compact(invoice.reference);
    const invoiceNumber = compact(invoice.invoiceNumber);
    if (reference && compactPurpose.includes(reference)) {
      add(invoice.patientId, { kind: "invoice_reference", value: reference, score: 100 });
    } else if (invoiceNumber && compactPurpose.includes(invoiceNumber)) {
      add(invoice.patientId, { kind: "invoice_number", value: invoiceNumber, score: 95 });
    }
  }

  const candidates: LedgerCandidate[] = Array.from(byPatient, ([patientId, evidence]) => ({
    patientId,
    amountCents: transaction.amountCents,
    confidenceScore: Math.max(...evidence.map((item) => item.score)),
    state: "candidate",
    evidence,
    reason: "Mehrere plausible Patienten; Split oder manuelle Entscheidung erforderlich",
  }));
  if (candidates.length === 1 && candidates[0].confidenceScore >= 75) {
    candidates[0].state = "confirmed_auto";
    candidates[0].reason = "Eindeutiger Patient mit nachvollziehbarem Beleg und mindestens 75 %";
  }
  return candidates.sort((left, right) => right.confidenceScore - left.confidenceScore);
}
