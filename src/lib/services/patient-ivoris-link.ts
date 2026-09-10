import { createServerClient } from "@/lib/db/supabase";
import { searchIvorisPatients } from "@/lib/api/ivoris-client";

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

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function selectUniqueRemoteIvorisIdentityCandidate(
  patient: PatientIdentity,
  candidates: Array<Record<string, unknown>>
): string | null {
  const ids = candidates
    .filter((candidate) => {
      const birthday = asText(candidate.Birthday ?? candidate.birthday).slice(0, 10);
      const firstname = asText(candidate.Firstname ?? candidate.firstname ?? candidate.FirstName);
      const lastname = asText(candidate.Lastname ?? candidate.lastname ?? candidate.LastName);
      return (
        birthday === patient.geburtsdatum.slice(0, 10) &&
        normalizePersonToken(firstname) === normalizePersonToken(patient.vorname) &&
        normalizePersonToken(lastname) === normalizePersonToken(patient.nachname)
      );
    })
    .map((candidate) => asText(candidate.Id ?? candidate.id))
    .filter(Boolean);
  const uniqueIds = Array.from(new Set(ids));
  return uniqueIds.length === 1 ? uniqueIds[0] : null;
}

export async function recoverStalePatientIvorisLink(
  db: DbClient,
  patient: PatientIdentity
): Promise<PatientIdentity> {
  const payload = await searchIvorisPatients({
    firstname: patient.vorname,
    lastname: patient.nachname,
    birthday: patient.geburtsdatum.slice(0, 10),
  });
  const recoveredId = selectUniqueRemoteIvorisIdentityCandidate(
    patient,
    Array.isArray(payload)
      ? payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
      : []
  );

  if (!recoveredId || recoveredId === patient.ivoris_id) return patient;

  const query = db.from("patients").update({ ivoris_id: recoveredId }).eq("id", patient.id);
  const { error } = patient.ivoris_id
    ? await query.eq("ivoris_id", patient.ivoris_id)
    : await query.is("ivoris_id", null);
  if (error) {
    throw new Error(`Wiedergefundene IVORIS-ID konnte nicht gespeichert werden: ${error.message}`);
  }

  return { ...patient, ivoris_id: recoveredId };
}
