import { createServerClient } from "@/lib/db/supabase";

type Severity = "critical" | "warning";

type Problem = {
  category: string;
  severity: Severity;
  count: number;
  sample: unknown[];
};

type SubmissionRow = {
  id: string;
  created_at: string;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum?: string | null;
  status?: string | null;
  signed_pdf_path?: string | null;
  patient_id?: string | null;
  matched_patient_id?: string | null;
  ivoris_synced?: boolean | null;
  ivoris_doc_synced?: boolean | null;
  ivoris_patient_id?: string | null;
  ivoris_document_id?: string | null;
  ivoris_sync_error?: string | null;
  ivoris_sync_failed_permanently?: boolean | null;
  ivoris_doc_failed_permanently?: boolean | null;
};

type SyncLogRow = {
  submission_id: string;
  created_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

function normalizeNamePart(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isManualReview(row: Pick<SubmissionRow, "ivoris_sync_error">) {
  return (row.ivoris_sync_error ?? "").startsWith("MANUAL_REVIEW:");
}

function pushProblem(
  problems: Problem[],
  category: string,
  severity: Severity,
  rows: unknown[]
) {
  if (!rows.length) return;
  problems.push({
    category,
    severity,
    count: rows.length,
    sample: rows.slice(0, 10),
  });
}

async function main() {
  const db = createServerClient();

  const problems: Problem[] = [];
  const now = new Date();
  const recentWindowIso = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    signedWithoutPdf,
    docSyncedWithoutDocumentId,
    patientRows,
    warningSuccessLogs,
    duplicatePatients,
    duplicateRecentSubmissions,
    pendingSignedDocuments,
    confirmedScribePushFailures,
  ] = await Promise.all([
    db
      .from("anamnese_submissions")
      .select("id, created_at, vorname, nachname, status, signed_pdf_path")
      .eq("status", "signiert")
      .is("signed_pdf_path", null)
      .limit(100),
    db
      .from("anamnese_submissions")
      .select(
        "id, created_at, vorname, nachname, ivoris_doc_synced, ivoris_document_id, signed_pdf_path"
      )
      .eq("ivoris_doc_synced", true)
      .is("ivoris_document_id", null)
      .limit(200),
    db
      .from("anamnese_submissions")
      .select(
        "id, created_at, vorname, nachname, geburtsdatum, patient_id, matched_patient_id, ivoris_synced, ivoris_doc_synced, ivoris_patient_id, ivoris_document_id, ivoris_sync_error, ivoris_sync_failed_permanently, ivoris_doc_failed_permanently, status, signed_pdf_path"
      )
      .limit(5000),
    db
      .from("animasign_sync_log")
      .select("submission_id, created_at, status, metadata")
      .eq("stage", "patient")
      .order("created_at", { ascending: false })
      .limit(5000),
    db
      .from("patients")
      .select("id, ivoris_id, vorname, nachname, geburtsdatum, created_at")
      .limit(10000),
    db
      .from("anamnese_submissions")
      .select("id, created_at, vorname, nachname, geburtsdatum, status, ivoris_patient_id, matched_patient_id")
      .gte("created_at", recentWindowIso)
      .limit(5000),
    db
      .from("anamnese_submissions")
      .select("id, created_at, vorname, nachname, status, signed_pdf_path, ivoris_document_id, ivoris_sync_error, ivoris_doc_failed_permanently")
      .eq("status", "signiert")
      .or("ivoris_doc_synced.is.null,ivoris_doc_synced.eq.false")
      .limit(5000),
    db
      .from("doku_eintraege")
      .select("id, termin_datum, patient_id, ivoris_push_status, ivoris_fehler, ivoris_entry_id, bestaetigt_am")
      .eq("status", "bestaetigt")
      .or("ivoris_push_status.is.null,ivoris_push_status.neq.gepusht")
      .limit(5000),
  ]);

  if (signedWithoutPdf.error) throw new Error(signedWithoutPdf.error.message);
  if (docSyncedWithoutDocumentId.error) throw new Error(docSyncedWithoutDocumentId.error.message);
  if (patientRows.error) throw new Error(patientRows.error.message);
  if (warningSuccessLogs.error) throw new Error(warningSuccessLogs.error.message);
  if (duplicatePatients.error) throw new Error(duplicatePatients.error.message);
  if (duplicateRecentSubmissions.error) throw new Error(duplicateRecentSubmissions.error.message);
  if (pendingSignedDocuments.error) throw new Error(pendingSignedDocuments.error.message);
  if (confirmedScribePushFailures.error) throw new Error(confirmedScribePushFailures.error.message);

  pushProblem(problems, "signed_without_pdf", "critical", signedWithoutPdf.data ?? []);

  const docRows = (docSyncedWithoutDocumentId.data ?? []).filter((row) => Boolean(row.signed_pdf_path));
  pushProblem(problems, "doc_synced_without_document_id", "critical", docRows);
  pushProblem(problems, "signed_pdf_without_ivoris_document", "critical", pendingSignedDocuments.data ?? []);
  pushProblem(problems, "confirmed_scribe_push_not_succeeded", "critical", confirmedScribePushFailures.data ?? []);

  const patientRowsData = (patientRows.data ?? []) as SubmissionRow[];
  const localLinkMissing = patientRowsData.filter(
    (row) =>
      row.status === "signiert" &&
      (!row.patient_id || !row.matched_patient_id)
  );
  pushProblem(problems, "local_patient_link_missing", "critical", localLinkMissing);

  const patientSyncedWithoutId = patientRowsData.filter(
    (row) => row.ivoris_synced === true && !row.ivoris_patient_id
  );
  const manualReviewRows = patientSyncedWithoutId.filter((row) => isManualReview(row));
  const hardBrokenPatientRows = patientSyncedWithoutId.filter((row) => !isManualReview(row));
  pushProblem(
    problems,
    "patient_synced_without_ivoris_id",
    "critical",
    hardBrokenPatientRows
  );
  pushProblem(
    problems,
    "manual_review_without_ivoris_id",
    "warning",
    manualReviewRows
  );

  const latestPatientLogBySubmission = new Map<string, SyncLogRow>();
  for (const row of (warningSuccessLogs.data ?? []) as SyncLogRow[]) {
    if (!latestPatientLogBySubmission.has(row.submission_id)) {
      latestPatientLogBySubmission.set(row.submission_id, row);
    }
  }

  const currentFalseGreens = patientRowsData
    .filter((row) => row.ivoris_synced === true)
    .filter((row) => {
      const latestLog = latestPatientLogBySubmission.get(row.id);
      if (!latestLog || latestLog.status !== "success") return false;
      return latestLog.metadata?.warningCode === "IVORIS_CONTACT_UPDATE_BLOCKED";
    })
    .map((row) => ({
      ...row,
      latestWarningAt: latestPatientLogBySubmission.get(row.id)?.created_at ?? null,
      latestWarningMetadata: latestPatientLogBySubmission.get(row.id)?.metadata ?? null,
    }));
  pushProblem(problems, "false_green_contact_blocked", "critical", currentFalseGreens);

  const permanentlyStopped = patientRowsData.filter(
    (row) => row.ivoris_sync_failed_permanently === true || row.ivoris_doc_failed_permanently === true
  );
  pushProblem(problems, "permanently_stopped_sync", "critical", permanentlyStopped);

  const signedPdfWrongPath = patientRowsData.filter(
    (row) =>
      row.status === "signiert" &&
      typeof row.signed_pdf_path === "string" &&
      row.signed_pdf_path.endsWith("/Anamnesebogen.pdf")
  );
  pushProblem(
    problems,
    "signed_pdf_points_to_unsigned_file",
    "critical",
    signedPdfWrongPath
  );

  const patientGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of duplicatePatients.data ?? []) {
    const key = [
      normalizeNamePart(row.vorname),
      normalizeNamePart(row.nachname),
      row.geburtsdatum ?? "",
    ].join("|");
    if (!row.geburtsdatum || !normalizeNamePart(row.vorname) || !normalizeNamePart(row.nachname)) {
      continue;
    }
    if (!patientGroups.has(key)) {
      patientGroups.set(key, []);
    }
    patientGroups.get(key)!.push(row as unknown as Record<string, unknown>);
  }
  const duplicatePatientGroups = Array.from(patientGroups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, count: rows.length, rows: rows.slice(0, 5) }));
  pushProblem(
    problems,
    "local_patient_duplicate_groups",
    "critical",
    duplicatePatientGroups
  );

  const submissionGroups = new Map<string, Array<Record<string, unknown>>>();
  for (const row of duplicateRecentSubmissions.data ?? []) {
    const key = [
      normalizeNamePart(row.vorname),
      normalizeNamePart(row.nachname),
      row.geburtsdatum ?? "",
    ].join("|");
    if (!row.geburtsdatum || !normalizeNamePart(row.vorname) || !normalizeNamePart(row.nachname)) {
      continue;
    }
    if (!submissionGroups.has(key)) {
      submissionGroups.set(key, []);
    }
    submissionGroups.get(key)!.push(row as unknown as Record<string, unknown>);
  }
  const duplicateSubmissionGroups = Array.from(submissionGroups.entries())
    .map(([key, rows]) => ({
      key,
      rows,
      activeRows: rows.filter((row) => row.status !== "fehler"),
    }))
    .filter(({ activeRows }) => activeRows.length > 1)
    .map(({ key, rows, activeRows }) => ({
      key,
      count: activeRows.length,
      rows: rows.slice(0, 5),
    }));
  pushProblem(
    problems,
    "recent_submission_duplicate_groups",
    "critical",
    duplicateSubmissionGroups
  );

  const criticalProblems = problems.filter((problem) => problem.severity === "critical");
  const result = {
    ok: criticalProblems.length === 0,
    checkedAt: now.toISOString(),
    problems,
  };

  console.log(JSON.stringify(result, null, 2));
  if (criticalProblems.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
