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

async function main() {
  const db = createServerClient();
  const [outboxResult, submissionsResult, scribeResult, patientsResult] = await Promise.all([
    db.from("integration_outbox_jobs").select("artifact_type,status,attempt_count,created_at").neq("status", "succeeded").limit(10000),
    db.from("anamnese_submissions").select("status,signed_pdf_path,ivoris_doc_synced").limit(10000),
    db.from("doku_eintraege").select("status,ivoris_push_status,ivoris_error_class").eq("status", "bestaetigt").limit(10000),
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

  const now = Date.now();
  const oldest = outbox
    .map((job) => new Date(job.created_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0];
  const report = {
    openJobs: outbox.length,
    retries: outbox.filter((job) => job.status === "retry_wait").length,
    manualReviews: outbox.filter((job) => job.status === "manual_review").length,
    oldestOpenHours: oldest ? Math.floor((now - oldest) / 3_600_000) : 0,
    signedPdfMissingInIvoris: submissions.filter((row) => row.signed_pdf_path && row.ivoris_doc_synced !== true).length,
    confirmedScribeNotPushed: scribe.filter((row) => row.ivoris_push_status !== "gepusht").length,
    patientDuplicateGroups: Array.from(identityCounts.values()).filter((count) => count > 1).length,
  };
  const healthy = report.openJobs === 0 && report.signedPdfMissingInIvoris === 0 &&
    report.confirmedScribeNotPushed === 0 && report.patientDuplicateGroups === 0;
  const description = [
    `Automatische Wochenübersicht (${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})`,
    "",
    `Gesamtstatus: ${healthy ? "GRÜN" : "HANDLUNGSBEDARF"}`,
    `Offene Outbox-Jobs: ${report.openJobs}`,
    `Davon technische Retries: ${report.retries}`,
    `Davon manuell zu prüfen: ${report.manualReviews}`,
    `Ältester offener Job: ${report.oldestOpenHours} Stunden`,
    `Signierte PDFs noch nicht in IVORIS: ${report.signedPdfMissingInIvoris}`,
    `Bestätigte Scribe-Einträge noch nicht gepusht: ${report.confirmedScribeNotPushed}`,
    `Lokale Patientendubletten-Gruppen: ${report.patientDuplicateGroups}`,
    "",
    healthy
      ? "Keine Aktion erforderlich."
      : "Bitte AnimaSign-Dashboard und Praxis-Inbox öffnen; fachliche Fälle bewusst zuweisen und technische Fälle bis zum Rücklesebeweis beobachten.",
  ].join("\n");

  const { error } = await db.from("alerts").insert({
    typ: "system",
    titel: `Anima-Stabilität: Wochenübersicht ${healthy ? "grün" : "mit Handlungsbedarf"}`,
    beschreibung: description,
    schweregrad: healthy ? "info" : "warnung",
    empfaenger: "alle",
    aktion_url: "/anima-sign",
  });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify({ ok: true, healthy, report }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
