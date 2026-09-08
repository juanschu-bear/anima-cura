import { createServerClient } from "@/lib/db/supabase";

type DbClient = ReturnType<typeof createServerClient>;

export type PatientIdentity = {
  id: string;
  ivoris_id: string | null;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
};

function normalizePersonToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ");
}

export function selectUniqueIvorisIdentityCandidate(
  patient: PatientIdentity,
  candidates: PatientIdentity[]
): PatientIdentity | null {
  const matches = candidates.filter(
    (candidate) =>
      candidate.id !== patient.id &&
      Boolean(candidate.ivoris_id?.trim()) &&
      candidate.geburtsdatum === patient.geburtsdatum &&
      normalizePersonToken(candidate.vorname) === normalizePersonToken(patient.vorname) &&
      normalizePersonToken(candidate.nachname) === normalizePersonToken(patient.nachname)
  );

  return matches.length === 1 ? matches[0] : null;
}

export async function repairDokuPatientIvorisLink(
  db: DbClient,
  dokuId: string,
  patient: PatientIdentity
): Promise<PatientIdentity> {
  if (patient.ivoris_id?.trim()) return patient;

  const { data, error } = await db
    .from("patients")
    .select("id, ivoris_id, vorname, nachname, geburtsdatum")
    .eq("geburtsdatum", patient.geburtsdatum);

  if (error) throw new Error(`IVORIS-Verknuepfung konnte nicht geprueft werden: ${error.message}`);

  const canonical = selectUniqueIvorisIdentityCandidate(
    patient,
    (data ?? []) as PatientIdentity[]
  );
  if (!canonical) return patient;

  const { error: updateError } = await db
    .from("doku_eintraege")
    .update({ patient_id: canonical.id })
    .eq("id", dokuId)
    .eq("patient_id", patient.id);

  if (updateError) {
    throw new Error(`IVORIS-Verknuepfung konnte nicht repariert werden: ${updateError.message}`);
  }

  return canonical;
}
