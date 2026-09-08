import { createServerClient } from "@/lib/db/supabase";

type PatientIdentity = {
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
};

function identityKey(patient: PatientIdentity) {
  const normalize = (value: string | null) => (value ?? "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return `${normalize(patient.vorname)}|${normalize(patient.nachname)}|${patient.geburtsdatum ?? ""}`;
}

function berlinDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

async function main() {
  const db = createServerClient();
  const [outboxResult, submissionsResult, scribeResult, patientsResult] = await Promise.all([
    db.from("integration_outbox_jobs").select("status,created_at").neq("status", "succeeded").limit(10000),
    db.from("anamnese_submissions").select("signed_pdf_path,ivoris_doc_synced").limit(10000),
    db.from("doku_eintraege").select("ivoris_push_status").eq("status", "bestaetigt").limit(10000),
    db.from("patients").select("vorname,nachname,geburtsdatum").limit(10000),
  ]);
  const firstError = outboxResult.error ?? submissionsResult.error ?? scribeResult.error ?? patientsResult.error;
  if (firstError) throw new Error(firstError.message);

  const outbox = outboxResult.data ?? [];
  const submissions = submissionsResult.data ?? [];
  const scribe = scribeResult.data ?? [];
  const identityCounts = new Map<string, number>();
  for (const patient of (patientsResult.data ?? []) as PatientIdentity[]) {
    if (!patient.geburtsdatum || !patient.vorname || !patient.nachname) continue;
    const key = identityKey(patient);
    identityCounts.set(key, (identityCounts.get(key) ?? 0) + 1);
  }

  const oldest = outbox
    .map((job) => new Date(job.created_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const metrics = {
    openJobs: outbox.length,
    retries: outbox.filter((job) => job.status === "retry_wait").length,
    manualReviews: outbox.filter((job) => job.status === "manual_review").length,
    oldestOpenHours: oldest ? Math.floor((Date.now() - oldest) / 3_600_000) : 0,
    signedPdfMissingInIvoris: submissions.filter((row) => row.signed_pdf_path && row.ivoris_doc_synced !== true).length,
    confirmedScribeNotPushed: scribe.filter((row) => row.ivoris_push_status !== "gepusht").length,
    patientDuplicateGroups: Array.from(identityCounts.values()).filter((count) => count > 1).length,
  };
  const healthy = metrics.openJobs === 0 && metrics.signedPdfMissingInIvoris === 0 &&
    metrics.confirmedScribeNotPushed === 0 && metrics.patientDuplicateGroups === 0;
  const observationDate = berlinDate();

  const { error } = await db.from("stability_observations").upsert({
    observation_date: observationDate,
    observed_at: new Date().toISOString(),
    healthy,
    metrics,
    updated_at: new Date().toISOString(),
  }, { onConflict: "observation_date" });
  if (error) throw new Error(error.message);

  console.log(JSON.stringify({ ok: true, observationDate, healthy, metrics }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

