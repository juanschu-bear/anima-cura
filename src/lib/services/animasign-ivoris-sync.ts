import { createServerClient } from "@/lib/db/supabase";
import {
  createIvorisPatient,
  fetchIvorisPatientById,
  searchIvorisPatients,
  type IvorisPatientInput,
  updateIvorisPatient,
} from "@/lib/api/ivoris-client";
import { addIvorisDocument } from "@/lib/api/ivoris-doku-client";
import { formatManualReviewError } from "@/lib/services/animasign-sync-status";

const SYNC_BACKOFF_MINUTES = [5, 30, 120, 720, 2880] as const;
const MAX_SYNC_ATTEMPTS = SYNC_BACKOFF_MINUTES.length;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DbClient = ReturnType<typeof createServerClient>;
type SyncStage = "patient" | "document";
type SyncStatus = "success" | "error" | "skipped";

type SubmissionRow = {
  id: string;
  patient_id: string | null;
  matched_patient_id: string | null;
  is_existing: boolean | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  geburtsdatum: string | null;
  answers: Record<string, unknown> | null;
  signed_pdf_path: string | null;
  signiert_am: string | null;
  created_at: string;
  ivoris_synced: boolean | null;
  ivoris_doc_synced: boolean | null;
  ivoris_sync_error: string | null;
  ivoris_patient_id?: string | null;
  ivoris_document_id?: string | null;
  ivoris_sync_retry_count?: number | null;
  ivoris_doc_retry_count?: number | null;
  ivoris_sync_next_retry_at?: string | null;
  ivoris_doc_next_retry_at?: string | null;
  ivoris_sync_failed_permanently?: boolean | null;
  ivoris_doc_failed_permanently?: boolean | null;
};

type PatientRow = {
  id: string;
  ivoris_id: string | null;
};

type IvorisContactSnapshot = {
  Email?: string;
  Phone?: string;
  Mobile?: string;
  Address?: {
    Street?: string;
    Zip?: string;
    City?: string;
    Country?: string;
  };
};

type SyncAttemptContext = {
  requestPayload?: unknown;
  responsePayload?: unknown;
  metadata?: Record<string, unknown>;
};

type StageOverrides = {
  attemptNo?: number;
  retryCountOnFailure?: number;
};

export type SubmissionSyncResult = {
  submissionId: string;
  patient: SyncStatus;
  document: SyncStatus;
  patientIvorisId?: string | null;
  documentId?: string | null;
  errors: string[];
};

export type NextStageSyncResult = {
  stage: SyncStage;
  found: boolean;
  submissionId?: string;
  result?: SubmissionSyncResult;
  reason?: string;
};

class ManualReviewRequiredError extends Error {
  constructor(
    message: string,
    readonly stage: SyncStage
  ) {
    super(message);
    this.name = "ManualReviewRequiredError";
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeIvorisId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "[object Object]") return null;
  return UUID_RE.test(trimmed) ? trimmed : null;
}

function normalizeMatchValue(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeEmailValue(value: unknown): string | null {
  const email = asString(value);
  return email ? email.toLowerCase() : null;
}

function normalizePhoneValue(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, "");
  if (compact.startsWith("+")) {
    const digits = compact.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }

  const digits = compact.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00") && digits.length > 2) {
    return `+${digits.slice(2)}`;
  }

  return digits;
}

function sanitizeFilenamePart(value: string | null | undefined): string {
  return (value ?? "Patient")
    .trim()
    .replace(/[^A-Za-z0-9\u00C0-\u017F_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "Patient";
}

function formatIsoDate(value: string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function toIsoDateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function buildAddress(answers: Record<string, unknown> | null | undefined) {
  if (!answers) return undefined;

  const street = [answers.patient_strasse, answers.patient_hausnummer]
    .map(asString)
    .filter(Boolean)
    .join(" ");
  const zip = asString(answers.patient_plz);
  const city = asString(answers.patient_wohnort);
  const country = "D";

  if (!street && !zip && !city) {
    return undefined;
  }

  return {
    ...(street ? { Street: street } : {}),
    ...(zip ? { Zip: zip } : {}),
    ...(city ? { City: city } : {}),
    Country: country,
  };
}

function buildContactUpdate(submission: SubmissionRow): Partial<IvorisPatientInput> {
  const answers = submission.answers ?? {};
  const email = asString(submission.email);
  const phone = asString(answers.patient_telefon);
  const mobile = asString(answers.patient_mobil);
  const address = buildAddress(answers);

  return {
    ...(email ? { Email: email } : {}),
    ...(phone ? { Phone: phone } : {}),
    ...(mobile ? { Mobile: mobile } : {}),
    ...(address ? { Address: address } : {}),
  };
}

function buildCreateInput(submission: SubmissionRow): IvorisPatientInput {
  const answers = submission.answers ?? {};

  return {
    Firstname: submission.vorname ?? "",
    Lastname: submission.nachname ?? "",
    Birthday: submission.geburtsdatum ?? "",
    Email: submission.email ?? "",
    Phone: asString(answers.patient_telefon) ?? "",
    Mobile: asString(answers.patient_mobil) ?? "",
    Address: {
      Street:
        [answers.patient_strasse, answers.patient_hausnummer]
          .map(asString)
          .filter(Boolean)
          .join(" ") || "",
      Zip: asString(answers.patient_plz) ?? "",
      City: asString(answers.patient_wohnort) ?? "",
      Country: "D",
    },
  };
}

function extractPatientPayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    if (candidate.patient && typeof candidate.patient === "object") {
      return candidate.patient as Record<string, unknown>;
    }
    return candidate;
  }
  return {};
}

function extractCurrentContacts(payload: unknown): IvorisContactSnapshot {
  const patient = extractPatientPayload(payload);
  const address =
    patient.Address && typeof patient.Address === "object"
      ? (patient.Address as Record<string, unknown>)
      : null;

  return {
    ...(asString(patient.Email) ? { Email: asString(patient.Email) ?? undefined } : {}),
    ...(asString(patient.Phone) ? { Phone: asString(patient.Phone) ?? undefined } : {}),
    ...(asString(patient.Mobile) ? { Mobile: asString(patient.Mobile) ?? undefined } : {}),
    ...(address
      ? {
          Address: {
            ...(asString(address.Street) ? { Street: asString(address.Street) ?? undefined } : {}),
            ...(asString(address.Zip) ? { Zip: asString(address.Zip) ?? undefined } : {}),
            ...(asString(address.City) ? { City: asString(address.City) ?? undefined } : {}),
            ...(asString(address.Country)
              ? { Country: asString(address.Country) ?? undefined }
              : {}),
          },
        }
      : {}),
  };
}

function extractCandidateBirthday(payload: Record<string, unknown>) {
  return (
    asString(payload.Birthday) ??
    asString(payload.birthDate) ??
    asString(payload.dateOfBirth) ??
    asString(payload.dob)
  );
}

function extractCandidateFirstname(payload: Record<string, unknown>) {
  return (
    asString(payload.Firstname) ??
    asString(payload.firstname) ??
    asString(payload.firstName) ??
    asString(payload.vorname)
  );
}

function extractCandidateLastname(payload: Record<string, unknown>) {
  return (
    asString(payload.Lastname) ??
    asString(payload.lastname) ??
    asString(payload.lastName) ??
    asString(payload.nachname)
  );
}

function extractCandidateEmail(payload: Record<string, unknown>) {
  return (
    normalizeEmailValue(payload.Email) ??
    normalizeEmailValue(payload.email) ??
    normalizeEmailValue(payload.mail)
  );
}

function extractCandidatePhones(payload: Record<string, unknown>) {
  const values = [
    normalizePhoneValue(payload.Phone),
    normalizePhoneValue(payload.Mobile),
    normalizePhoneValue(payload.telefon),
    normalizePhoneValue(payload.phone),
    normalizePhoneValue(payload.mobile),
    normalizePhoneValue(payload.tel),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
}

function extractSubmissionPhoneCandidates(submission: SubmissionRow) {
  const answers = submission.answers ?? {};
  const values = [
    normalizePhoneValue(answers.patient_telefon),
    normalizePhoneValue(answers.patient_mobil),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
}

function sameValue(left: string | undefined, right: string | undefined) {
  return (left ?? "").trim() === (right ?? "").trim();
}

function samePhoneValue(left: string | undefined, right: string | undefined) {
  return normalizePhoneValue(left) === normalizePhoneValue(right);
}

function sameAddress(
  left: IvorisContactSnapshot["Address"] | undefined,
  right: IvorisContactSnapshot["Address"] | undefined
) {
  return (
    sameValue(left?.Street, right?.Street) &&
    sameValue(left?.Zip, right?.Zip) &&
    sameValue(left?.City, right?.City) &&
    sameValue(left?.Country, right?.Country)
  );
}

function buildSingleFieldOperations(
  nextData: Partial<IvorisPatientInput>,
  currentData: IvorisContactSnapshot
) {
  const operations: Array<Partial<IvorisPatientInput>> = [];

  if (nextData.Email && !sameValue(nextData.Email, currentData.Email)) {
    operations.push({ Email: nextData.Email });
  }
  if (nextData.Phone && !samePhoneValue(nextData.Phone, currentData.Phone)) {
    operations.push({ Phone: nextData.Phone });
  }
  if (nextData.Mobile && !samePhoneValue(nextData.Mobile, currentData.Mobile)) {
    operations.push({ Mobile: nextData.Mobile });
  }
  if (nextData.Address && !sameAddress(nextData.Address, currentData.Address)) {
    operations.push({ Address: nextData.Address });
  }

  return operations;
}

function retryColumn(stage: SyncStage) {
  return stage === "patient" ? "ivoris_sync_retry_count" : "ivoris_doc_retry_count";
}

function nextRetryColumn(stage: SyncStage) {
  return stage === "patient"
    ? "ivoris_sync_next_retry_at"
    : "ivoris_doc_next_retry_at";
}

function permanentFailureColumn(stage: SyncStage) {
  return stage === "patient"
    ? "ivoris_sync_failed_permanently"
    : "ivoris_doc_failed_permanently";
}

function syncedColumn(stage: SyncStage) {
  return stage === "patient" ? "ivoris_synced" : "ivoris_doc_synced";
}

function computeNextRetryAt(retryCount: number) {
  const minutes =
    SYNC_BACKOFF_MINUTES[
      Math.min(Math.max(retryCount, 0), SYNC_BACKOFF_MINUTES.length - 1)
    ];
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function isIvorisIdentityConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(
    "Only one of the parameters firstname, lastname and birthday can be changed at the same time."
  );
}

async function writeSyncLog(
  db: DbClient,
  submissionId: string,
  stage: SyncStage,
  attemptNo: number,
  status: SyncStatus,
  errorText: string | null,
  context: SyncAttemptContext = {}
) {
  const { error } = await db.from("animasign_sync_log").insert({
    submission_id: submissionId,
    stage,
    attempt_no: attemptNo,
    status,
    error_text: errorText,
    request_payload: context.requestPayload ?? null,
    response_payload: context.responsePayload ?? null,
    metadata: context.metadata ?? null,
  });

  if (error) {
    console.error("[ANIMASIGN][SYNC] log insert failed:", error.message);
  }
}

async function markStageSuccess(
  db: DbClient,
  submissionId: string,
  stage: SyncStage,
  patch: Record<string, unknown> = {}
) {
  const { error } = await db
    .from("anamnese_submissions")
    .update({
      [syncedColumn(stage)]: true,
      [retryColumn(stage)]: 0,
      [nextRetryColumn(stage)]: null,
      [permanentFailureColumn(stage)]: false,
      ivoris_sync_error: null,
      ...patch,
    })
    .eq("id", submissionId);

  if (error) {
    console.error("[ANIMASIGN][SYNC] success update failed:", error.message);
  }
}

async function markStageFailure(
  db: DbClient,
  submissionId: string,
  stage: SyncStage,
  retryCount: number,
  errorText: string
) {
  const permanentFailure = retryCount >= MAX_SYNC_ATTEMPTS;
  const patch = {
    [syncedColumn(stage)]: false,
    [retryColumn(stage)]: retryCount,
    [nextRetryColumn(stage)]: permanentFailure ? null : computeNextRetryAt(retryCount),
    [permanentFailureColumn(stage)]: permanentFailure,
    ivoris_sync_error: errorText,
  };

  const { error } = await db
    .from("anamnese_submissions")
    .update(patch)
    .eq("id", submissionId);

  if (error) {
    console.error("[ANIMASIGN][SYNC] failure update failed:", error.message);
  }
}

async function markStageManualReview(
  db: DbClient,
  submissionId: string,
  stage: SyncStage,
  reason: string
) {
  const patch = {
    [syncedColumn(stage)]: false,
    [retryColumn(stage)]: MAX_SYNC_ATTEMPTS,
    [nextRetryColumn(stage)]: null,
    [permanentFailureColumn(stage)]: true,
    ivoris_sync_error: formatManualReviewError(reason),
  };

  const { error } = await db
    .from("anamnese_submissions")
    .update(patch)
    .eq("id", submissionId);

  if (error) {
    console.error("[ANIMASIGN][SYNC] manual review update failed:", error.message);
  }
}

async function loadSubmission(
  db: DbClient,
  submissionId: string
): Promise<SubmissionRow> {
  const { data, error } = await db
    .from("anamnese_submissions")
    .select(
      "id, patient_id, matched_patient_id, is_existing, vorname, nachname, email, geburtsdatum, answers, signed_pdf_path, signiert_am, created_at, ivoris_synced, ivoris_doc_synced, ivoris_sync_error, ivoris_patient_id, ivoris_document_id, ivoris_sync_retry_count, ivoris_doc_retry_count, ivoris_sync_next_retry_at, ivoris_doc_next_retry_at, ivoris_sync_failed_permanently, ivoris_doc_failed_permanently"
    )
    .eq("id", submissionId)
    .single();

  if (error || !data) {
    throw new Error(
      `Submission ${submissionId} konnte nicht geladen werden: ${error?.message ?? "unbekannt"}`
    );
  }

  return data as SubmissionRow;
}

async function loadResolvedPatient(
  db: DbClient,
  submission: SubmissionRow
): Promise<PatientRow | null> {
  const resolvedPatientId = submission.matched_patient_id ?? submission.patient_id;
  if (!resolvedPatientId) return null;

  const { data, error } = await db
    .from("patients")
    .select("id, ivoris_id")
    .eq("id", resolvedPatientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Patient ${resolvedPatientId} konnte nicht geladen werden: ${error.message}`);
  }

  return (data as PatientRow | null) ?? null;
}

async function patchSubmissionIvorisPatientId(
  db: DbClient,
  submissionId: string,
  ivorisId: string
) {
  const { error } = await db
    .from("anamnese_submissions")
    .update({ ivoris_patient_id: ivorisId })
    .eq("id", submissionId);

  if (error) {
    console.error("[ANIMASIGN][IVORIS] failed to patch submission ivoris_patient_id:", error.message);
  }
}

async function recoverIvorisPatientIdFromDirectory(
  db: DbClient,
  submission: SubmissionRow
): Promise<string> {
  const firstname = normalizeMatchValue(submission.vorname);
  const lastname = normalizeMatchValue(submission.nachname);
  const birthday = toIsoDateOrNull(submission.geburtsdatum);
  const email = normalizeEmailValue(submission.email);
  const phoneCandidates = extractSubmissionPhoneCandidates(submission);

  if (!birthday) {
    throw new ManualReviewRequiredError(
      `Dokument-Sync braucht manuelle Ivoris-Zuordnung, weil fuer ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} kein gueltiger Geburtstag vorliegt.`,
      "document"
    );
  }

  const strategyCounts: string[] = [];

  const pickRecoveredId = async (
    label: string,
    searchParams: Record<string, string | undefined>
  ) => {
    const payload = await searchIvorisPatients(searchParams);
    const matches = (Array.isArray(payload) ? payload : []).filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            normalizeIvorisId((entry as Record<string, unknown>).Id) &&
            toIsoDateOrNull(extractCandidateBirthday(entry as Record<string, unknown>)) === birthday
        )
    );

    console.log(
      `[ANIMASIGN][IVORIS] directory recovery submission=${submission.id} strategy=${label} candidates=${matches.length}`
    );
    strategyCounts.push(`${label}=${matches.length}`);

    if (matches.length !== 1) {
      return null;
    }

    const recoveredId = normalizeIvorisId(matches[0].Id);
    if (!recoveredId) {
      return null;
    }

    console.log(
      `[ANIMASIGN][IVORIS] recovered patientId=${recoveredId} from directory for submission=${submission.id} strategy=${label}`
    );
    await patchSubmissionIvorisPatientId(db, submission.id, recoveredId);
    return recoveredId;
  };

  if (firstname && lastname) {
    const recoveredId = await pickRecoveredId("name+birthday", {
      firstname: submission.vorname ?? undefined,
      lastname: submission.nachname ?? undefined,
      birthday,
    });
    if (recoveredId) {
      return recoveredId;
    }
  }

  if (email) {
    const recoveredId = await pickRecoveredId("email+birthday", {
      email,
      birthday,
    });
    if (recoveredId) {
      return recoveredId;
    }
  }

  for (const phone of phoneCandidates) {
    const byPhone = await pickRecoveredId("phone+birthday", {
      phone,
      birthday,
    });
    if (byPhone) {
      return byPhone;
    }

    const byMobile = await pickRecoveredId("mobile+birthday", {
      mobile: phone,
      birthday,
    });
    if (byMobile) {
      return byMobile;
    }
  }

  console.warn(
    `[ANIMASIGN][IVORIS] directory recovery failed for submission=${submission.id} name=${submission.vorname ?? ""} ${submission.nachname ?? ""} birthday=${birthday} email=${email ?? "-"} phones=${phoneCandidates.join(",") || "-"}`
  );
  throw new ManualReviewRequiredError(
    `Dokument-Sync braucht manuelle Ivoris-Zuordnung fuer ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} (${birthday}). Ivoris liefert keine eindeutige Person. Treffer: ${strategyCounts.join(", ") || "keine"}.`,
    "document"
  );
}

async function resolveSubmissionPatientIvorisId(
  db: DbClient,
  submission: SubmissionRow,
  preferredPatientIvorisId?: string | null
): Promise<string | null> {
  const preferred = normalizeIvorisId(preferredPatientIvorisId);
  if (preferred) return preferred;

  const resolvedPatient = await loadResolvedPatient(db, submission);
  const localPatientId = normalizeIvorisId(resolvedPatient?.ivoris_id);
  if (localPatientId) {
    await patchSubmissionIvorisPatientId(db, submission.id, localPatientId);
    return localPatientId;
  }

  const submissionPatientId = normalizeIvorisId(submission.ivoris_patient_id);
  if (submissionPatientId) {
    return submissionPatientId;
  }

  if (submission.ivoris_patient_id) {
    console.warn(
      `[ANIMASIGN][IVORIS] invalid stored ivoris_patient_id for submission=${submission.id}: ${submission.ivoris_patient_id}`
    );
  }

  return recoverIvorisPatientIdFromDirectory(db, submission);
}

async function syncExistingPatient(
  db: DbClient,
  submission: SubmissionRow
): Promise<{ status: SyncStatus; ivorisId: string | null; metadata?: Record<string, unknown> }> {
  const patient = await loadResolvedPatient(db, submission);
  if (!patient?.ivoris_id) {
    throw new Error("Bestandspatient hat keine gueltige ivoris_id");
  }

  const currentPatient = await fetchIvorisPatientById(patient.ivoris_id);
  const currentContacts = extractCurrentContacts(currentPatient);
  const requestedContacts = buildContactUpdate(submission);
  const operations = buildSingleFieldOperations(requestedContacts, currentContacts);

  if (operations.length === 0) {
    console.log(
      `[ANIMASIGN][IVORIS] submission=${submission.id} patient=${patient.ivoris_id} no contact delta`
    );
    return { status: "skipped", ivorisId: patient.ivoris_id, metadata: { operations: 0 } };
  }

  console.log(
    `[ANIMASIGN][IVORIS] submission=${submission.id} patient=${patient.ivoris_id} operations=${JSON.stringify(
      operations
    )}`
  );

  for (const operation of operations) {
    try {
      await updateIvorisPatient(patient.ivoris_id, operation);
    } catch (error) {
      if (isIvorisIdentityConstraintError(error)) {
        throw new ManualReviewRequiredError(
          `Ivoris blockiert das Kontakt-/Adressupdate fuer den Bestandspatienten ${submission.vorname ?? ""} ${submission.nachname ?? ""}. Das Dokument kann separat synchronisiert werden, die Stammdaten muessen aber manuell in Ivoris geprueft werden.`,
          "patient"
        );
      }
      throw error;
    }
  }

  return {
    status: "success",
    ivorisId: patient.ivoris_id,
    metadata: { operations: operations.length },
  };
}

async function syncNewPatient(
  db: DbClient,
  submission: SubmissionRow
): Promise<{ status: SyncStatus; ivorisId: string | null; requestPayload: IvorisPatientInput }> {
  const payload = buildCreateInput(submission);
  const ivorisId = await createIvorisPatient(payload);
  const resolvedPatientId = submission.matched_patient_id ?? submission.patient_id;

  if (resolvedPatientId) {
    const { error } = await db
      .from("patients")
      .update({ ivoris_id: ivorisId })
      .eq("id", resolvedPatientId);

    if (error) {
      throw new Error(`Lokaler Patient konnte nicht mit ivoris_id verknuepft werden: ${error.message}`);
    }
  }

  await patchSubmissionIvorisPatientId(db, submission.id, ivorisId);
  return { status: "success", ivorisId, requestPayload: payload };
}

async function syncPatientStage(
  db: DbClient,
  submission: SubmissionRow,
  overrides: StageOverrides = {}
): Promise<{ status: SyncStatus; ivorisId: string | null }> {
  const retryCount = submission.ivoris_sync_retry_count ?? 0;
  const attemptNo = overrides.attemptNo ?? retryCount + 1;
  const retryCountOnFailure = overrides.retryCountOnFailure ?? attemptNo;

  try {
    const result =
      submission.is_existing === true
        ? await syncExistingPatient(db, submission)
        : await syncNewPatient(db, submission);

    await writeSyncLog(db, submission.id, "patient", attemptNo, result.status, null, {
      requestPayload:
        "requestPayload" in result
          ? result.requestPayload
          : { mode: submission.is_existing ? "existing" : "create" },
      metadata: "metadata" in result ? result.metadata : undefined,
      responsePayload: result.ivorisId ? { ivorisId: result.ivorisId } : null,
    });

    await markStageSuccess(db, submission.id, "patient", {
      ivoris_patient_id: result.ivorisId,
    });

    return { status: result.status, ivorisId: result.ivorisId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeSyncLog(db, submission.id, "patient", attemptNo, "error", message);
    if (error instanceof ManualReviewRequiredError) {
      await markStageManualReview(db, submission.id, "patient", error.message);
    } else {
      await markStageFailure(db, submission.id, "patient", retryCountOnFailure, message);
    }
    throw error;
  }
}

async function syncDocumentStage(
  db: DbClient,
  submission: SubmissionRow,
  preferredPatientIvorisId?: string | null,
  overrides: StageOverrides = {}
): Promise<{ status: SyncStatus; documentId: string | null }> {
  const retryCount = submission.ivoris_doc_retry_count ?? 0;
  const attemptNo = overrides.attemptNo ?? retryCount + 1;
  const retryCountOnFailure = overrides.retryCountOnFailure ?? attemptNo;

  try {
    const patient = await resolveSubmissionPatientIvorisId(db, submission, preferredPatientIvorisId);

    if (!patient) {
      throw new Error("Dokument-Sync ohne gueltige ivoris PatientId nicht moeglich");
    }

    const pdfPath = submission.signed_pdf_path ?? `${submission.id}/Anamnesebogen.pdf`;
    const { data: fileData, error: fileError } = await db.storage
      .from("anamnese-dokumente")
      .download(pdfPath);

    if (fileError || !fileData) {
      throw new Error(`PDF konnte nicht geladen werden: ${fileError?.message ?? pdfPath}`);
    }

    const fileBuffer = await fileData.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);
    const base64 = Buffer.from(fileBytes).toString("base64");
    const docDate = formatIsoDate(submission.signiert_am ?? submission.created_at);
    const docName = `Anamnesebogen_${sanitizeFilenamePart(submission.nachname)}_${docDate}.pdf`;

    console.log(
      `[ANIMASIGN][IVORIS] doc sync submission=${submission.id} patient=${patient} blobType=${
        fileData.constructor?.name ?? typeof fileData
      } bytes=${fileBytes.byteLength} base64Type=${typeof base64} base64Length=${base64.length}`
    );

    const documentId = await addIvorisDocument({
      patientIvorisId: patient,
      name: docName,
      date: docDate,
      contentBase64: base64,
    });

    await writeSyncLog(db, submission.id, "document", attemptNo, "success", null, {
      requestPayload: {
        patientIvorisId: patient,
        name: docName,
        date: docDate,
        pdfPath,
        fileBytes: fileBytes.byteLength,
        base64Length: base64.length,
      },
      responsePayload: { documentId },
    });

    await markStageSuccess(db, submission.id, "document", {
      ivoris_document_id: documentId,
    });

    return { status: "success", documentId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeSyncLog(db, submission.id, "document", attemptNo, "error", message);
    if (error instanceof ManualReviewRequiredError) {
      await markStageManualReview(db, submission.id, "document", error.message);
    } else {
      await markStageFailure(db, submission.id, "document", retryCountOnFailure, message);
    }
    throw error;
  }
}

function isRetryDue(value: string | null | undefined) {
  if (!value) return true;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return true;
  return parsed.getTime() <= Date.now();
}

export async function syncAnimaSignSubmission(
  submissionId: string,
  options: {
    stages?: SyncStage[];
    db?: DbClient;
    stageOverrides?: Partial<Record<SyncStage, StageOverrides>>;
  } = {}
): Promise<SubmissionSyncResult> {
  const db = options.db ?? createServerClient();
  const submission = await loadSubmission(db, submissionId);
  const requestedStages = options.stages ?? ["patient", "document"];
  const result: SubmissionSyncResult = {
    submissionId,
    patient: "skipped",
    document: "skipped",
    errors: [],
  };

  let patientIvorisId: string | null | undefined = submission.ivoris_patient_id ?? null;

  if (requestedStages.includes("patient")) {
    try {
      const patientResult = await syncPatientStage(
        db,
        submission,
        options.stageOverrides?.patient
      );
      result.patient = patientResult.status;
      patientIvorisId = patientResult.ivorisId;
      result.patientIvorisId = patientResult.ivorisId;
    } catch (error) {
      result.patient = "error";
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (requestedStages.includes("document")) {
    try {
      const docResult = await syncDocumentStage(
        db,
        submission,
        patientIvorisId,
        options.stageOverrides?.document
      );
      result.document = docResult.status;
      result.documentId = docResult.documentId;
    } catch (error) {
      result.document = "error";
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}

async function loadPendingStageCandidates(
  db: DbClient,
  stage: SyncStage,
  excludeSubmissionIds: string[] = []
) {
  let query = db
    .from("anamnese_submissions")
    .select(
      "id, signed_pdf_path, ivoris_synced, ivoris_doc_synced, ivoris_sync_retry_count, ivoris_doc_retry_count, ivoris_sync_next_retry_at, ivoris_doc_next_retry_at, ivoris_sync_failed_permanently, ivoris_doc_failed_permanently, created_at"
    )
    .eq(syncedColumn(stage), false)
    .not(permanentFailureColumn(stage), "is", true)
    .order("created_at", { ascending: true })
    .limit(200);

  if (stage === "document") {
    query = query.not("signed_pdf_path", "is", null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Pending ${stage} syncs konnten nicht geladen werden: ${error.message}`);
  }

  return ((data ?? []) as Array<
    Pick<
      SubmissionRow,
      | "id"
      | "signed_pdf_path"
      | "ivoris_synced"
      | "ivoris_doc_synced"
      | "ivoris_sync_retry_count"
      | "ivoris_doc_retry_count"
      | "ivoris_sync_next_retry_at"
      | "ivoris_doc_next_retry_at"
      | "ivoris_sync_failed_permanently"
      | "ivoris_doc_failed_permanently"
    >
  >).filter((row) => {
    if (excludeSubmissionIds.includes(row.id)) {
      return false;
    }

    return isRetryDue(row[nextRetryColumn(stage)]);
  });
}

export async function runNextPendingAnimaSignStage(
  stage: SyncStage,
  options: {
    db?: DbClient;
    excludeSubmissionIds?: string[];
  } = {}
): Promise<NextStageSyncResult> {
  const db = options.db ?? createServerClient();
  const candidates = await loadPendingStageCandidates(
    db,
    stage,
    options.excludeSubmissionIds ?? []
  );
  const next = candidates[0];

  if (!next) {
    return { stage, found: false, reason: "Keine faellige Submission" };
  }

  return {
    stage,
    found: true,
    submissionId: next.id,
    result: await syncAnimaSignSubmission(next.id, {
      db,
      stages: [stage],
    }),
  };
}

export async function retryPendingAnimaSignSyncs(
  options: {
    db?: DbClient;
    limit?: number;
  } = {}
) {
  const db = options.db ?? createServerClient();
  const limit = options.limit ?? 25;
  const { data, error } = await db
    .from("anamnese_submissions")
    .select(
      "id, ivoris_synced, ivoris_doc_synced, ivoris_sync_next_retry_at, ivoris_doc_next_retry_at, ivoris_sync_failed_permanently, ivoris_doc_failed_permanently, signed_pdf_path"
    )
    .or("ivoris_synced.eq.false,ivoris_doc_synced.eq.false")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Pending AnimaSign Syncs konnten nicht geladen werden: ${error.message}`);
  }

  const summaries: SubmissionSyncResult[] = [];

  for (const row of (data ?? []) as Array<
    Pick<
      SubmissionRow,
      | "id"
      | "ivoris_synced"
      | "ivoris_doc_synced"
      | "ivoris_sync_next_retry_at"
      | "ivoris_doc_next_retry_at"
      | "ivoris_sync_failed_permanently"
      | "ivoris_doc_failed_permanently"
      | "signed_pdf_path"
    >
  >) {
    const stages: SyncStage[] = [];

    if (
      row.ivoris_synced === false &&
      row.ivoris_sync_failed_permanently !== true &&
      isRetryDue(row.ivoris_sync_next_retry_at)
    ) {
      stages.push("patient");
    }

    if (
      row.ivoris_doc_synced === false &&
      row.ivoris_doc_failed_permanently !== true &&
      Boolean(row.signed_pdf_path) &&
      isRetryDue(row.ivoris_doc_next_retry_at)
    ) {
      stages.push("document");
    }

    if (!stages.length) {
      continue;
    }

    summaries.push(await syncAnimaSignSubmission(row.id, { db, stages }));
  }

  return {
    processed: summaries.length,
    patientSuccess: summaries.filter((entry) => entry.patient === "success").length,
    documentSuccess: summaries.filter((entry) => entry.document === "success").length,
    failures: summaries.filter((entry) => entry.errors.length > 0).length,
    results: summaries,
  };
}
