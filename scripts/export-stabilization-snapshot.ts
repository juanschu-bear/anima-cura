import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/db/supabase";

const REFERENCE_TARGETS = [
  ["user_profiles", "patient_id"],
  ["anamnese_submissions", "patient_id"],
  ["anamnese_submissions", "matched_patient_id"],
  ["offene_posten", "patient_id"],
  ["raten", "patient_id"],
  ["ratenplaene", "patient_id"],
  ["transaktionen", "matched_patient_id"],
  ["ki_analysen", "patient_id"],
  ["behandlungsfall", "patient_id"],
  ["doku_eintraege", "patient_id"],
  ["patient_documents", "patient_id"],
  ["behandlungsphasen", "patient_id"],
  ["patient_messages", "patient_id"],
  ["patient_notifications", "patient_id"],
  ["push_subscriptions", "patient_id"],
  ["patient_engagement", "patient_id"],
  ["patient_consents", "patient_id"],
  ["anima_balance_buchungen", "patient_id"],
  ["mahnungen", "patient_id"],
  ["kassen_zahlungen", "patient_id"],
] as const;

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .replace(/\s+/g, " ");
}

function identityKey(row: Record<string, unknown>) {
  return `${normalize(row.vorname)}|${normalize(row.nachname)}|${row.geburtsdatum ?? ""}`;
}

async function main() {
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  if (!outputArg) throw new Error("--output=/absoluter/pfad.json fehlt");
  const outputPath = path.resolve(outputArg.slice("--output=".length));
  const db = createAdminClient();

  const { data: allPatients, error: patientError } = await db.from("patients").select("*").limit(10000);
  if (patientError) throw patientError;

  const groups = new Map<string, Array<Record<string, unknown>>>();
  for (const patient of (allPatients ?? []) as Array<Record<string, unknown>>) {
    const key = identityKey(patient);
    if (!normalize(patient.vorname) || !normalize(patient.nachname) || !patient.geburtsdatum) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(patient);
  }

  const duplicateGroups = Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));
  const affectedPatientIds = new Set(
    duplicateGroups.flatMap((group) => group.rows.map((row) => String(row.id)))
  );

  // Der konkret gemeldete Fall Maria Elena Schubert wird auch dann gesichert,
  // wenn er nicht Teil einer lokalen Dublettengruppe ist.
  for (const patient of (allPatients ?? []) as Array<Record<string, unknown>>) {
    if (normalize(patient.vorname) === "maria elena" && normalize(patient.nachname) === "schubert") {
      affectedPatientIds.add(String(patient.id));
    }
  }

  const patientIds = Array.from(affectedPatientIds);
  const references: Record<string, unknown> = {};
  const referenceErrors: Record<string, string> = {};

  for (const [table, column] of REFERENCE_TARGETS) {
    const key = `${table}.${column}`;
    const { data, error } = await db.from(table).select("*").in(column, patientIds).limit(10000);
    if (error) {
      referenceErrors[key] = error.message;
      continue;
    }
    references[key] = data ?? [];
  }

  const submissionRows = Object.entries(references)
    .filter(([key]) => key.startsWith("anamnese_submissions."))
    .flatMap(([, rows]) => rows as Array<Record<string, unknown>>);
  const submissionById = new Map(submissionRows.map((row) => [String(row.id), row]));
  const submissions = Array.from(submissionById.values());
  const submissionIds = Array.from(submissionById.keys());

  const { data: syncLogs, error: syncLogError } = submissionIds.length
    ? await db.from("animasign_sync_log").select("*").in("submission_id", submissionIds).limit(10000)
    : { data: [], error: null };
  if (syncLogError) referenceErrors.animasign_sync_log = syncLogError.message;

  const storageManifest: Record<string, unknown> = {};
  for (const submission of submissions) {
    const submissionId = String(submission.id);
    const { data, error } = await db.storage.from("anamnese-dokumente").list(submissionId, { limit: 100 });
    storageManifest[submissionId] = error
      ? { error: error.message }
      : (data ?? []).map((file) => ({ name: file.name, id: file.id, metadata: file.metadata }));
  }

  const snapshot = {
    format: "anima-stabilization-snapshot-v1",
    createdAt: new Date().toISOString(),
    purpose: "Referenzieller Export vor Patienten- und Synchronisationsbereinigung",
    duplicateGroups,
    affectedPatients: (allPatients ?? []).filter((row) => affectedPatientIds.has(String(row.id))),
    references,
    animasignSyncLog: syncLogs ?? [],
    storageBucket: "anamnese-dokumente",
    storageManifest,
    referenceErrors,
  };

  await mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  await chmod(outputPath, 0o600);

  console.log(
    JSON.stringify({
      ok: Object.keys(referenceErrors).length === 0,
      outputPath,
      duplicateGroups: duplicateGroups.length,
      affectedPatients: affectedPatientIds.size,
      submissions: submissions.length,
      storageFolders: Object.keys(storageManifest).length,
      referenceErrors,
    })
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
