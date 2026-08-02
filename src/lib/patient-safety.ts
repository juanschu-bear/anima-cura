const BLOCKED_PATIENT_IDS = new Set([
  "aaaaaaaa-0000-0000-0000-000000000001",
  "aa4659a4-52d8-424e-9142-23bcf5609583",
]);

const TEST_PATTERN = /\b(test|zztest|demo|dummy|mustermann|musterpatient)\b/i;

type PatientLike = {
  id?: string | null;
  vorname?: string | null;
  nachname?: string | null;
  ivoris_nummer?: string | null;
  ivoris_id?: string | null;
  behandlung?: string | null;
};

type RateLike = {
  bezahlt_am?: string | null;
  [key: string]: unknown;
};

export function isSyntheticPatient(patient: PatientLike | null | undefined) {
  if (!patient) return true;
  if (patient.id && BLOCKED_PATIENT_IDS.has(patient.id)) return true;

  const fullName = `${patient.vorname || ""} ${patient.nachname || ""}`.trim();
  if (TEST_PATTERN.test(fullName)) return true;
  if (TEST_PATTERN.test(patient.behandlung || "")) return true;
  if ((patient.ivoris_id || "").toUpperCase().startsWith("ZZTEST")) return true;

  return false;
}

export function hasReliablePatientIdentity(patient: PatientLike | null | undefined) {
  if (!patient) return false;
  if (isSyntheticPatient(patient)) return false;
  return Boolean((patient.ivoris_nummer || "").trim());
}

export function isSafeDunningRate(
  rate: RateLike | null | undefined,
  patient: PatientLike | null | undefined
) {
  if (!rate) return false;
  if (rate.bezahlt_am) return false;
  return hasReliablePatientIdentity(patient);
}
