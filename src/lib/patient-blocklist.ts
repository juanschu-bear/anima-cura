const BLOCKED_PATIENT_FULL_NAMES = new Set([
  "RABE DON LELAND",
  "DON LELAND RABE",
]);

function normalizeBlockedPatientText(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export function isBlockedPatientName(vorname: string | null | undefined, nachname: string | null | undefined) {
  const forward = normalizeBlockedPatientText(`${nachname ?? ""} ${vorname ?? ""}`);
  const reverse = normalizeBlockedPatientText(`${vorname ?? ""} ${nachname ?? ""}`);
  return BLOCKED_PATIENT_FULL_NAMES.has(forward) || BLOCKED_PATIENT_FULL_NAMES.has(reverse);
}

export function isBlockedPatientRecord(patient: { vorname?: string | null; nachname?: string | null } | null | undefined) {
  if (!patient) return false;
  return isBlockedPatientName(patient.vorname, patient.nachname);
}

export function sanitizeBlockedTransactionMatch<
  T extends {
    matching_status?: string | null;
    matched_patient_id?: string | null;
    matched_rate_id?: string | null;
    matching_score?: number | null;
    matching_details?: Record<string, unknown> | null;
    patients?: { vorname?: string | null; nachname?: string | null } | null;
  },
>(tx: T): T {
  if (!isBlockedPatientRecord(tx.patients)) return tx;
  return {
    ...tx,
    matching_status: "unklar",
    matched_patient_id: null,
    matched_rate_id: null,
    matching_score: null,
    patients: null,
    matching_details: {
      ...(tx.matching_details || {}),
      methode: "manuell",
      quelle: "blocked_patient_cleanup",
      name_score: 0,
      betrag_match: false,
      zweck_score: 0,
    },
  };
}
