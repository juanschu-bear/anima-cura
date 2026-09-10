import { createHash } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import {
  createIvorisPatient,
  fetchIvorisPatientById,
  searchIvorisPatients,
  type IvorisPatientInput,
  updateIvorisPatient,
} from "@/lib/api/ivoris-client";
import {
  addIvorisDocument,
  addIvorisKarteiEintrag,
} from "@/lib/api/ivoris-doku-client";
import {
  decideIvorisDirectoryAction,
  type DirectoryStrategyResult,
} from "@/lib/services/animasign-ivoris-directory";
import { buildAnamnesisSummaryText } from "@/lib/services/animasign-anamnesis-summary";
import {
  formatManualReviewError,
  isNonRetryableIvorisResponse,
} from "@/lib/services/animasign-sync-status";

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
  ivoris_patient_error?: string | null;
  ivoris_document_error?: string | null;
  ivoris_patient_id?: string | null;
  ivoris_document_id?: string | null;
  ivoris_sync_retry_count?: number | null;
  ivoris_doc_retry_count?: number | null;
  ivoris_sync_next_retry_at?: string | null;
  ivoris_doc_next_retry_at?: string | null;
  ivoris_sync_failed_permanently?: boolean | null;
  ivoris_doc_failed_permanently?: boolean | null;
  ivoris_summary_synced?: boolean | null;
  ivoris_summary_synced_at?: string | null;
  ivoris_summary_hash?: string | null;
};

type PatientRow = {
  id: string;
  ivoris_id: string | null;
};

type LocalPatientCandidate = {
  id: string;
  ivoris_id: string | null;
  vorname?: string | null;
  nachname?: string | null;
  geburtsdatum?: string | null;
  email?: string | null;
  telefon?: string | null;
};

type LocalPatientMatchDecision =
  | { kind: "reuse"; candidate: LocalPatientCandidate; reason: "contact" | "identity" }
  | { kind: "none" }
  | { kind: "manual_review"; reason: string };

type IdentityClaimRow = {
  fingerprint: string;
  patient_id: string | null;
  ivoris_id: string | null;
  last_submission_id: string | null;
  status: "pending" | "resolved" | "manual_review" | "error";
  note: string | null;
};

export function buildIdentityFingerprint(
  submission: Pick<SubmissionRow, "vorname" | "nachname" | "geburtsdatum">
) {
  const birthday = toIsoDateOrNull(submission.geburtsdatum);
  const firstname = normalizeMatchValue(submission.vorname);
  const lastname = normalizeMatchValue(submission.nachname);

  if (!birthday || !firstname || !lastname) {
    return null;
  }

  return createHash("sha256")
    .update(`${firstname}|${lastname}|${birthday}`)
    .digest("hex");
}

export function decideIdentityClaimAction(
  claim: IdentityClaimRow | null,
  submissionId: string
): { kind: "allow_create" } | { kind: "reuse"; ivorisId: string; patientId: string | null } | { kind: "manual_review"; reason: string } {
  if (!claim) {
    return { kind: "allow_create" };
  }

  if (claim.ivoris_id) {
    return {
      kind: "reuse",
      ivorisId: claim.ivoris_id,
      patientId: claim.patient_id ?? null,
    };
  }

  if (claim.patient_id) {
    return {
      kind: "manual_review",
      reason: "Lokaler Bestandspatient ist fuer diese Identitaet bereits bekannt, aber ohne sichere ivoris_id darf keine weitere Neu-Anlage passieren.",
    };
  }

  if (claim.status === "pending" && claim.last_submission_id && claim.last_submission_id !== submissionId) {
    return {
      kind: "manual_review",
      reason: "Fuer diese Identitaet laeuft bereits eine andere AnimaSign-Einreichung. Automatische Neu-Anlage wird blockiert, bis der Fall sauber aufgeloest ist.",
    };
  }

  if (claim.status === "manual_review") {
    return {
      kind: "manual_review",
      reason: claim.note || "Dieser Identitaetsfall wurde bereits zur manuellen Pruefung angehalten.",
    };
  }

  return { kind: "allow_create" };
}

type IvorisContactSnapshot = {
  Firstname?: string;
  Lastname?: string;
  Birthday?: string;
  Gender?: string;
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

type FieldVerificationStatus = "verified" | "mismatch" | "not_provided" | "unsupported";
type FieldVerificationResult = {
  status: FieldVerificationStatus;
  target: string | null;
  verifiedAt?: string;
};
type PatientFieldVerification = Record<string, FieldVerificationResult>;

export function isTransientIvorisAvailabilityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("(502)") ||
    message.includes("(503)") ||
    message.includes("(504)") ||
    message.includes("nicht stabil erreichbar")
  );
}

export function isIvorisPatientNotFoundResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /AddDocument fehlgeschlagen \(400\)/i.test(message) &&
    /patient with Id .* could not be found/i.test(message)
  );
}

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

function extractMissingColumn(message: string | null | undefined): string | null {
  if (!message) return null;
  const match = message.match(/column [^.]+\.(\w+) does not exist/i);
  if (match?.[1]) return match[1];
  const legacyMatch = message.match(/Could not find the '([^']+)' column/i);
  return legacyMatch?.[1] ?? null;
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

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

function identityClaimKey(fingerprint: string) {
  return `animasign_identity_claim:${fingerprint}`;
}

function sanitizeFilenamePart(value: string | null | undefined): string {
  return (value ?? "Patient")
    .trim()
    .replace(/[^A-Za-z0-9\u00C0-\u017F_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "Patient";
}

function buildSummaryHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function shouldPushIvorisSummary(params: {
  alreadySynced: boolean | null | undefined;
  previousHash: string | null | undefined;
  nextHash: string;
}) {
  if (params.alreadySynced) return false;
  if (params.previousHash && params.previousHash === params.nextHash) return false;
  return true;
}

function shouldWriteIvorisSummaryNote() {
  return process.env.ANIMASIGN_PUSH_IVORIS_SUMMARY === "true";
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
    ...(asString(patient.Firstname) ? { Firstname: asString(patient.Firstname) ?? undefined } : {}),
    ...(asString(patient.Lastname) ? { Lastname: asString(patient.Lastname) ?? undefined } : {}),
    ...(asString(patient.Birthday) ? { Birthday: asString(patient.Birthday) ?? undefined } : {}),
    ...(asString(patient.Gender) ? { Gender: asString(patient.Gender) ?? undefined } : {}),
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

export function namesMatchSubmission(
  submission: Pick<SubmissionRow, "vorname" | "nachname">,
  candidateFirstname: string | null | undefined,
  candidateLastname: string | null | undefined
) {
  const firstname = normalizeMatchValue(submission.vorname);
  const lastname = normalizeMatchValue(submission.nachname);

  if (!firstname || !lastname) {
    return false;
  }

  return (
    firstname === normalizeMatchValue(candidateFirstname ?? null) &&
    lastname === normalizeMatchValue(candidateLastname ?? null)
  );
}

export function shouldReusePriorSubmissionMatch(params: {
  sameName: boolean;
  sameEmail: boolean;
  samePhone: boolean;
  hasSubmissionContact: boolean;
}) {
  return (
    params.sameName &&
    (params.sameEmail || params.samePhone || !params.hasSubmissionContact)
  );
}

function extractSubmissionPhoneCandidates(submission: SubmissionRow) {
  const answers = submission.answers ?? {};
  const values = [
    normalizePhoneValue(answers.patient_telefon),
    normalizePhoneValue(answers.patient_mobil),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(values));
}

export function decideExactLocalPatientCandidate(
  submission: Pick<SubmissionRow, "vorname" | "nachname" | "email" | "geburtsdatum" | "answers">,
  candidates: LocalPatientCandidate[]
): LocalPatientMatchDecision {
  const birthday = toIsoDateOrNull(submission.geburtsdatum);
  const firstname = normalizeMatchValue(submission.vorname);
  const lastname = normalizeMatchValue(submission.nachname);
  const email = normalizeEmailValue(submission.email);
  const phoneCandidates = new Set(extractSubmissionPhoneCandidates(submission as SubmissionRow));

  if (!birthday || !firstname || !lastname) {
    return { kind: "none" };
  }

  const exactIdentityMatches = candidates.filter((candidate) => {
    if (toIsoDateOrNull(candidate.geburtsdatum ?? null) !== birthday) return false;
    if (normalizeMatchValue(candidate.vorname) !== firstname) return false;
    if (normalizeMatchValue(candidate.nachname) !== lastname) return false;
    return true;
  });

  if (exactIdentityMatches.length > 1) {
    return {
      kind: "manual_review",
      reason: `Lokaler Patient ist nicht eindeutig: ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} (${birthday}) kommt mehrfach im Bestand vor.`,
    };
  }

  if (exactIdentityMatches.length !== 1) {
    return { kind: "none" };
  }

  const candidate = exactIdentityMatches[0];
  const patientEmail = normalizeEmailValue(candidate.email);
  const patientPhone = normalizePhoneValue(candidate.telefon);
  const sameEmail = Boolean(email && patientEmail && email === patientEmail);
  const samePhone = Boolean(patientPhone && phoneCandidates.has(patientPhone));

  if (sameEmail || samePhone) {
    return { kind: "reuse", candidate, reason: "contact" };
  }

  return { kind: "reuse", candidate, reason: "identity" };
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

export function buildContactVerificationResults(
  requested: Partial<IvorisPatientInput>,
  actual: IvorisContactSnapshot,
  verifiedAt = new Date().toISOString()
): PatientFieldVerification {
  const result = (
    provided: boolean,
    matches: boolean,
    target: string
  ): FieldVerificationResult => provided
    ? { status: matches ? "verified" : "mismatch", target, verifiedAt }
    : { status: "not_provided", target };

  return {
    email: result(Boolean(requested.Email), sameValue(requested.Email, actual.Email), "Patient.Email"),
    telefon: result(Boolean(requested.Phone), samePhoneValue(requested.Phone, actual.Phone), "Patient.Phone"),
    mobiltelefon: result(Boolean(requested.Mobile), samePhoneValue(requested.Mobile, actual.Mobile), "Patient.Mobile"),
    adresse: result(Boolean(requested.Address), sameAddress(requested.Address, actual.Address), "Patient.Address"),
    anrede: { status: "unsupported", target: null },
    versicherten_kontakt: { status: "unsupported", target: null },
  };
}

function assertVerifiedContactResults(results: PatientFieldVerification) {
  const mismatches = Object.entries(results)
    .filter(([, result]) => result.status === "mismatch")
    .map(([field]) => field);
  if (mismatches.length > 0) {
    throw new Error(`IVORIS-Ruecklesepruefung fehlgeschlagen fuer: ${mismatches.join(", ")}`);
  }
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

function buildExistingPatientUpdateBase(
  currentData: IvorisContactSnapshot,
  submission: SubmissionRow
): Pick<IvorisPatientInput, "Firstname" | "Lastname" | "Birthday"> &
  Partial<Pick<IvorisPatientInput, "Gender">> {
  const birthday =
    asString(currentData.Birthday) ??
    toIsoDateOrNull(submission.geburtsdatum) ??
    submission.geburtsdatum ??
    "";
  const firstname = asString(currentData.Firstname) ?? asString(submission.vorname) ?? "";
  const lastname = asString(currentData.Lastname) ?? asString(submission.nachname) ?? "";
  const gender = asString(currentData.Gender);

  return {
    Firstname: firstname,
    Lastname: lastname,
    Birthday: birthday,
    ...(gender ? { Gender: gender } : {}),
  };
}

function buildExistingPatientUpdateOperations(
  currentData: IvorisContactSnapshot,
  submission: SubmissionRow
) {
  const requestedContacts = buildContactUpdate(submission);
  const operations = buildSingleFieldOperations(requestedContacts, currentData);
  const base = buildExistingPatientUpdateBase(currentData, submission);

  return operations.map((operation) => ({
    ...base,
    ...operation,
  }));
}

export function buildFallbackExistingPatientUpdateOperations(
  submission: Pick<SubmissionRow, "vorname" | "nachname" | "email" | "geburtsdatum" | "answers">
) {
  const currentData: IvorisContactSnapshot = {};
  return buildExistingPatientUpdateOperations(currentData, submission as SubmissionRow);
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

function stageErrorColumn(stage: SyncStage) {
  return stage === "patient" ? "ivoris_patient_error" : "ivoris_document_error";
}

function otherStageErrorColumn(stage: SyncStage) {
  return stage === "patient" ? "ivoris_document_error" : "ivoris_patient_error";
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
  const { data: current, error: loadError } = await db
    .from("anamnese_submissions")
    .select("ivoris_patient_error, ivoris_document_error")
    .eq("id", submissionId)
    .single();
  if (loadError) {
    console.error("[ANIMASIGN][SYNC] success state load failed:", loadError.message);
  }
  const remainingError = current
    ? (current[otherStageErrorColumn(stage) as keyof typeof current] as string | null)
    : null;

  const { error } = await db
    .from("anamnese_submissions")
    .update({
      [syncedColumn(stage)]: true,
      [retryColumn(stage)]: 0,
      [nextRetryColumn(stage)]: null,
      [permanentFailureColumn(stage)]: false,
      [stageErrorColumn(stage)]: null,
      ivoris_sync_error: remainingError ?? null,
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
  const patch = {
    [syncedColumn(stage)]: false,
    [retryColumn(stage)]: retryCount,
    [nextRetryColumn(stage)]: computeNextRetryAt(retryCount),
    [permanentFailureColumn(stage)]: false,
    [stageErrorColumn(stage)]: errorText,
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
    [stageErrorColumn(stage)]: formatManualReviewError(reason),
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
  const requiredColumns = [
    "id",
    "patient_id",
    "matched_patient_id",
    "is_existing",
    "vorname",
    "nachname",
    "email",
    "geburtsdatum",
    "answers",
    "signed_pdf_path",
    "signiert_am",
    "created_at",
    "ivoris_synced",
    "ivoris_doc_synced",
    "ivoris_sync_error",
    "ivoris_patient_error",
    "ivoris_document_error",
    "ivoris_patient_id",
    "ivoris_document_id",
    "ivoris_sync_retry_count",
    "ivoris_doc_retry_count",
    "ivoris_sync_next_retry_at",
    "ivoris_doc_next_retry_at",
    "ivoris_sync_failed_permanently",
    "ivoris_doc_failed_permanently",
  ];
  const optionalColumns = [
    "ivoris_summary_synced",
    "ivoris_summary_synced_at",
    "ivoris_summary_hash",
  ];
  const selectedColumns = [...requiredColumns, ...optionalColumns];

  for (let attempt = 0; attempt < optionalColumns.length + 1; attempt += 1) {
    const { data, error } = await db
      .from("anamnese_submissions")
      .select(selectedColumns.join(", "))
      .eq("id", submissionId)
      .single();

    if (!error && data) {
      return {
        ivoris_summary_synced: null,
        ivoris_summary_synced_at: null,
        ivoris_summary_hash: null,
        ...((data as unknown) as SubmissionRow),
      };
    }

    const missingColumn = extractMissingColumn(error?.message);
    if (!missingColumn || !optionalColumns.includes(missingColumn)) {
      throw new Error(
        `Submission ${submissionId} konnte nicht geladen werden: ${error?.message ?? "unbekannt"}`
      );
    }

    const index = selectedColumns.indexOf(missingColumn);
    if (index >= 0) {
      selectedColumns.splice(index, 1);
    }
  }
  throw new Error(`Submission ${submissionId} konnte nicht geladen werden: optional schema fallback exhausted`);
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

async function patchSubmissionResolvedPatient(
  db: DbClient,
  submissionId: string,
  patientId: string,
  ivorisId: string | null
) {
  const patch: Record<string, unknown> = {
    patient_id: patientId,
    matched_patient_id: patientId,
    is_existing: true,
  };

  if (ivorisId) {
    patch.ivoris_patient_id = ivorisId;
  }

  const { error } = await db
    .from("anamnese_submissions")
    .update(patch)
    .eq("id", submissionId);

  if (error) {
    console.error("[ANIMASIGN][IVORIS] failed to patch resolved patient:", error.message);
  }
}

async function persistRecoveredIvorisPatientLink(
  db: DbClient,
  submission: SubmissionRow,
  staleIvorisId: string,
  recoveredIvorisId: string
) {
  await patchSubmissionIvorisPatientId(db, submission.id, recoveredIvorisId);

  const resolvedPatientId = submission.matched_patient_id ?? submission.patient_id;
  if (resolvedPatientId) {
    const { error } = await db
      .from("patients")
      .update({ ivoris_id: recoveredIvorisId })
      .eq("id", resolvedPatientId)
      .eq("ivoris_id", staleIvorisId);

    if (error) {
      throw new Error(
        `Wiedergefundene IVORIS-ID konnte nicht am lokalen Patienten gespeichert werden: ${error.message}`
      );
    }
  }

  await updateIdentityClaim(db, buildIdentityFingerprint(submission), {
    patient_id: resolvedPatientId ?? null,
    ivoris_id: recoveredIvorisId,
    last_submission_id: submission.id,
    status: "resolved",
    note: `Veraltete IVORIS-ID ${staleIvorisId} nach eindeutiger Verzeichnissuche ersetzt.`,
  });
}

async function loadIdentityClaim(
  db: DbClient,
  fingerprint: string
): Promise<IdentityClaimRow | null> {
  const { data, error } = await db
    .from("einstellungen")
    .select("value")
    .eq("key", identityClaimKey(fingerprint))
    .maybeSingle();

  if (error) {
    throw new Error(`Identity-Claim konnte nicht geladen werden: ${error.message}`);
  }

  const value = data?.value;
  if (!value || typeof value !== "object") return null;
  const claim = value as Partial<IdentityClaimRow>;
  if (typeof claim.fingerprint !== "string") return null;
  return {
    fingerprint: claim.fingerprint,
    patient_id: claim.patient_id ?? null,
    ivoris_id: claim.ivoris_id ?? null,
    last_submission_id: claim.last_submission_id ?? null,
    status: claim.status ?? "pending",
    note: claim.note ?? null,
  };
}

async function claimSubmissionIdentity(
  db: DbClient,
  submission: SubmissionRow
): Promise<{ fingerprint: string; claim: IdentityClaimRow | null }> {
  const fingerprint = buildIdentityFingerprint(submission);
  if (!fingerprint) {
    return { fingerprint: "", claim: null };
  }

  try {
    const { error } = await db.from("einstellungen").insert({
      key: identityClaimKey(fingerprint),
      value: {
        fingerprint,
        vorname: submission.vorname ?? "",
        nachname: submission.nachname ?? "",
        geburtsdatum: toIsoDateOrNull(submission.geburtsdatum),
        first_submission_id: submission.id,
        last_submission_id: submission.id,
        patient_id: null,
        ivoris_id: null,
        status: "pending",
        note: null,
      },
    });

    if (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw new Error(`Identity-Claim konnte nicht reserviert werden: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    fingerprint,
    claim: await loadIdentityClaim(db, fingerprint),
  };
}

async function updateIdentityClaim(
  db: DbClient,
  fingerprint: string | null,
  patch: Record<string, unknown>
) {
  if (!fingerprint) return;

  const current = await loadIdentityClaim(db, fingerprint);
  if (!current) return;

  const { error } = await db
    .from("einstellungen")
    .update({
      value: {
        ...current,
        ...patch,
        fingerprint,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("key", identityClaimKey(fingerprint));

  if (error) {
    console.error("[ANIMASIGN][IVORIS] failed to update identity claim:", error.message);
  }
}

async function findExactLocalPatientCandidate(
  db: DbClient,
  submission: SubmissionRow
): Promise<LocalPatientCandidate | null> {
  const birthday = toIsoDateOrNull(submission.geburtsdatum);
  const firstname = normalizeMatchValue(submission.vorname);
  const lastname = normalizeMatchValue(submission.nachname);
  const email = normalizeEmailValue(submission.email);
  const phoneCandidates = new Set(extractSubmissionPhoneCandidates(submission));

  if (!birthday || !firstname || !lastname) {
    return null;
  }

  const { data, error } = await db
    .from("patients")
    .select("id, ivoris_id, vorname, nachname, geburtsdatum, email, telefon")
    .eq("geburtsdatum", birthday)
    .limit(50);

  if (error) {
    throw new Error(`Lokale Patienten konnten nicht geladen werden: ${error.message}`);
  }

  const decision = decideExactLocalPatientCandidate(
    submission,
    (data ?? []) as LocalPatientCandidate[]
  );

  if (decision.kind === "manual_review") {
    throw new ManualReviewRequiredError(decision.reason, "patient");
  }

  return decision.kind === "reuse" ? decision.candidate : null;
}

async function findReusableIvorisPatientIdFromPriorSubmissions(
  db: DbClient,
  submission: SubmissionRow
): Promise<string | null> {
  const birthday = toIsoDateOrNull(submission.geburtsdatum);
  if (!birthday) {
    return null;
  }

  const email = normalizeEmailValue(submission.email);
  const firstname = normalizeMatchValue(submission.vorname);
  const lastname = normalizeMatchValue(submission.nachname);
  const phoneCandidates = new Set(extractSubmissionPhoneCandidates(submission));

  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id, vorname, nachname, email, geburtsdatum, answers, ivoris_patient_id")
    .eq("geburtsdatum", birthday)
    .neq("id", submission.id)
    .not("ivoris_patient_id", "is", null)
    .limit(50);

  if (error) {
    throw new Error(`Vorherige AnimaSign-Submissions konnten nicht geprueft werden: ${error.message}`);
  }

  const matchingIds = new Set<string>();

  for (const row of data || []) {
    const priorIvorisId = normalizeIvorisId(row.ivoris_patient_id);
    if (!priorIvorisId) {
      continue;
    }

    const priorEmail = normalizeEmailValue(row.email);
    const priorFirstname = normalizeMatchValue(row.vorname);
    const priorLastname = normalizeMatchValue(row.nachname);
    const priorPhones = new Set(
      extractSubmissionPhoneCandidates({
        ...submission,
        vorname: row.vorname,
        nachname: row.nachname,
        email: row.email,
        geburtsdatum: row.geburtsdatum,
        answers: (row.answers as Record<string, unknown> | null) ?? null,
      })
    );

    const sameEmail = Boolean(email && priorEmail && email === priorEmail);
    const sameName = Boolean(firstname && lastname && firstname === priorFirstname && lastname === priorLastname);
    const samePhone = Array.from(phoneCandidates).some((phone) => priorPhones.has(phone));

    if (
      shouldReusePriorSubmissionMatch({
        sameName,
        sameEmail,
        samePhone,
        hasSubmissionContact: Boolean(email || phoneCandidates.size > 0),
      })
    ) {
      matchingIds.add(priorIvorisId);
    }
  }

  const uniqueIds = Array.from(matchingIds);
  if (uniqueIds.length === 1) {
    await patchSubmissionIvorisPatientId(db, submission.id, uniqueIds[0]);
    console.log(
      `[ANIMASIGN][IVORIS] reused prior submission ivoris_patient_id=${uniqueIds[0]} for submission=${submission.id}`
    );
    return uniqueIds[0];
  }

  if (uniqueIds.length > 1) {
    throw new ManualReviewRequiredError(
      `Patient-Sync braucht manuelle Ivoris-Zuordnung fuer ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} (${birthday}). Vorherige AnimaSign-Submissions verweisen auf mehrere Ivoris-Patienten.`,
      "patient"
    );
  }

  return null;
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

async function findReusableIvorisPatientIdForNewSubmission(
  db: DbClient,
  submission: SubmissionRow
): Promise<string | null> {
  const identityFingerprint = buildIdentityFingerprint(submission);
  if (identityFingerprint) {
    const currentClaim = await loadIdentityClaim(db, identityFingerprint);
    const claimDecision = decideIdentityClaimAction(currentClaim, submission.id);

    if (claimDecision.kind === "reuse") {
      if (claimDecision.patientId) {
        await patchSubmissionResolvedPatient(
          db,
          submission.id,
          claimDecision.patientId,
          claimDecision.ivorisId
        );
      }
      await patchSubmissionIvorisPatientId(db, submission.id, claimDecision.ivorisId);
      console.log(
        `[ANIMASIGN][IVORIS] reused identity claim ivoris_patient_id=${claimDecision.ivorisId} for submission=${submission.id}`
      );
      return claimDecision.ivorisId;
    }

    if (claimDecision.kind === "manual_review") {
      throw new ManualReviewRequiredError(
        `Patient-Sync braucht manuelle Ivoris-Zuordnung fuer ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} (${toIsoDateOrNull(submission.geburtsdatum) ?? "ohne Geburtstag"}). ${claimDecision.reason}`,
        "patient"
      );
    }
  }

  const localPatient = await findExactLocalPatientCandidate(db, submission);
  if (localPatient?.id) {
    await patchSubmissionResolvedPatient(
      db,
      submission.id,
      localPatient.id,
      localPatient.ivoris_id ?? null
    );
    await updateIdentityClaim(db, identityFingerprint, {
      patient_id: localPatient.id,
      ivoris_id: localPatient.ivoris_id ?? null,
      last_submission_id: submission.id,
      status: localPatient.ivoris_id ? "resolved" : "manual_review",
      note: localPatient.ivoris_id
        ? "Lokaler Bestandspatient wiederverwendet."
        : "Lokaler Bestandspatient eindeutig erkannt, aber ohne ivoris_id.",
    });
  }

  if (localPatient?.id && localPatient.ivoris_id) {
    await patchSubmissionResolvedPatient(
      db,
      submission.id,
      localPatient.id,
      localPatient.ivoris_id
    );
    console.log(
      `[ANIMASIGN][IVORIS] resolved exact local patient=${localPatient.id} ivoris_id=${localPatient.ivoris_id} for submission=${submission.id}`
    );
    return localPatient.ivoris_id;
  }

  const priorSubmissionIvorisId = await findReusableIvorisPatientIdFromPriorSubmissions(db, submission);
  if (priorSubmissionIvorisId) {
    return priorSubmissionIvorisId;
  }

  const firstname = normalizeMatchValue(submission.vorname);
  const lastname = normalizeMatchValue(submission.nachname);
  const birthday = toIsoDateOrNull(submission.geburtsdatum);
  const email = normalizeEmailValue(submission.email);
  const phoneCandidates = extractSubmissionPhoneCandidates(submission);

  if (!birthday) {
    return null;
  }

  const strategyResults: DirectoryStrategyResult[] = [];

  const collectMatches = async (
    label: string,
    searchParams: Record<string, string | undefined>
  ) => {
    const payload = await searchIvorisPatients(searchParams);
    const ids = (Array.isArray(payload) ? payload : [])
      .filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              normalizeIvorisId((entry as Record<string, unknown>).Id) &&
              toIsoDateOrNull(extractCandidateBirthday(entry as Record<string, unknown>)) === birthday &&
              (label === "name+birthday" ||
                namesMatchSubmission(
                  submission,
                  extractCandidateFirstname(entry as Record<string, unknown>),
                  extractCandidateLastname(entry as Record<string, unknown>)
                ))
          )
      )
      .map((entry) => normalizeIvorisId(entry.Id))
      .filter((id): id is string => Boolean(id));

    strategyResults.push({
      label,
      ids: Array.from(new Set(ids)),
    });
  };

  if (firstname && lastname) {
    await collectMatches("name+birthday", {
      firstname: submission.vorname ?? undefined,
      lastname: submission.nachname ?? undefined,
      birthday,
    });
  }

  if (email) {
    await collectMatches("email+birthday", {
      email,
      birthday,
    });
  }

  for (const phone of phoneCandidates) {
    await collectMatches("phone+birthday", {
      phone,
      birthday,
    });
    await collectMatches("mobile+birthday", {
      mobile: phone,
      birthday,
    });
  }

  const decision = decideIvorisDirectoryAction(strategyResults);
  console.log(
    `[ANIMASIGN][IVORIS] new-patient directory decision submission=${submission.id} decision=${decision.kind} strategies=${decision.summary.join(", ")}`
  );

  if (decision.kind === "reuse") {
    await patchSubmissionIvorisPatientId(db, submission.id, decision.id);
    return decision.id;
  }

  if (decision.kind === "manual_review") {
    throw new ManualReviewRequiredError(
      `Patient-Sync braucht manuelle Ivoris-Zuordnung fuer ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} (${birthday}). Ivoris liefert mehrere moegliche Treffer. Treffer: ${decision.summary.join(", ") || "keine"}.`,
      "patient"
    );
  }

  if (localPatient?.id && !localPatient.ivoris_id) {
    throw new ManualReviewRequiredError(
      `Patient-Sync braucht manuelle Ivoris-Zuordnung fuer ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} (${birthday}). Lokaler Bestandspatient wurde eindeutig erkannt, aber ohne belastbare ivoris_id darf kein neuer Ivoris-Patient automatisch angelegt werden.`,
      "patient"
    );
  }

  const identityReservation = await claimSubmissionIdentity(db, submission);
  if (identityReservation.fingerprint) {
    const claimDecision = decideIdentityClaimAction(identityReservation.claim, submission.id);
    if (claimDecision.kind === "reuse") {
      if (claimDecision.patientId) {
        await patchSubmissionResolvedPatient(
          db,
          submission.id,
          claimDecision.patientId,
          claimDecision.ivorisId
        );
      }
      await patchSubmissionIvorisPatientId(db, submission.id, claimDecision.ivorisId);
      return claimDecision.ivorisId;
    }
    if (claimDecision.kind === "manual_review") {
      await updateIdentityClaim(db, identityReservation.fingerprint, {
        last_submission_id: submission.id,
        status: "manual_review",
        note: claimDecision.reason,
      });
      throw new ManualReviewRequiredError(
        `Patient-Sync braucht manuelle Ivoris-Zuordnung fuer ${submission.vorname ?? "Unbekannt"} ${submission.nachname ?? ""} (${birthday}). ${claimDecision.reason}`,
        "patient"
      );
    }
  }

  return null;
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
): Promise<{
  status: SyncStatus;
  ivorisId: string | null;
  fieldResults: PatientFieldVerification;
  metadata?: Record<string, unknown>;
}> {
  const patient = await loadResolvedPatient(db, submission);
  let patientIvorisId = normalizeIvorisId(patient?.ivoris_id);
  if (!patientIvorisId) {
    patientIvorisId = await resolveSubmissionPatientIvorisId(db, submission);
  }
  if (!patientIvorisId) {
    throw new ManualReviewRequiredError(
      "Bestandspatient konnte nicht eindeutig einer IVORIS-Akte zugeordnet werden.",
      "patient"
    );
  }
  if (patient?.id && !normalizeIvorisId(patient.ivoris_id)) {
    const { error } = await db
      .from("patients")
      .update({ ivoris_id: patientIvorisId })
      .eq("id", patient.id);
    if (error) {
      throw new Error(`Sicher gefundene IVORIS-ID konnte lokal nicht verknuepft werden: ${error.message}`);
    }
  }

  await patchSubmissionIvorisPatientId(db, submission.id, patientIvorisId);

  let operations: Array<Partial<IvorisPatientInput>> = [];
  let metadata: Record<string, unknown> = { operations: 0 };
  const requestedContacts = buildContactUpdate(submission);

  try {
    const currentPatient = await fetchIvorisPatientById(patientIvorisId);
    const currentContacts = extractCurrentContacts(currentPatient);
    operations = buildExistingPatientUpdateOperations(currentContacts, submission);
  } catch (error) {
    if (!isTransientIvorisAvailabilityError(error)) {
      throw error;
    }

    operations = buildFallbackExistingPatientUpdateOperations(submission);
    metadata = {
      operations: operations.length,
      usedSubmissionFallback: true,
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
    console.warn(
      `[ANIMASIGN][IVORIS] submission=${submission.id} patient=${patientIvorisId} using submission fallback after transient GetPatient failure`
    );
  }

  if (operations.length === 0) {
    console.log(
      `[ANIMASIGN][IVORIS] submission=${submission.id} patient=${patientIvorisId} no contact delta`
    );
    const actual = extractCurrentContacts(await fetchIvorisPatientById(patientIvorisId));
    const fieldResults = buildContactVerificationResults(requestedContacts, actual);
    assertVerifiedContactResults(fieldResults);
    return { status: "skipped", ivorisId: patientIvorisId, fieldResults, metadata };
  }

  console.log(
    `[ANIMASIGN][IVORIS] submission=${submission.id} patient=${patientIvorisId} operations=${JSON.stringify(
      operations
    )}`
  );

  for (const operation of operations) {
    try {
      await updateIvorisPatient(patientIvorisId, operation);
    } catch (error) {
      if (isIvorisIdentityConstraintError(error)) {
        throw new Error(
          `IVORIS blockiert das Kontakt-/Adressupdate fuer den Bestandspatienten ${submission.vorname ?? ""} ${submission.nachname ?? ""}. ` +
            "Die Stammdaten wurden nicht uebernommen; erneuter Sync oder manuelle Pruefung noetig."
        );
      }
      throw error;
    }
  }

  const actual = extractCurrentContacts(await fetchIvorisPatientById(patientIvorisId));
  const fieldResults = buildContactVerificationResults(requestedContacts, actual);
  assertVerifiedContactResults(fieldResults);

  return {
    status: "success",
    ivorisId: patientIvorisId,
    fieldResults,
    metadata: {
      ...metadata,
      operations: operations.length,
    },
  };
}

async function syncNewPatient(
  db: DbClient,
  submission: SubmissionRow
): Promise<{ status: SyncStatus; ivorisId: string | null; requestPayload: IvorisPatientInput; fieldResults: PatientFieldVerification }> {
  const payload = buildCreateInput(submission);
  const reusableIvorisId = await findReusableIvorisPatientIdForNewSubmission(db, submission);
  const identityFingerprint = buildIdentityFingerprint(submission);

  if (reusableIvorisId) {
    await updateIdentityClaim(db, identityFingerprint, {
      ivoris_id: reusableIvorisId,
      last_submission_id: submission.id,
      status: "resolved",
      note: "Bereits vorhandene Ivoris-Person wiederverwendet.",
    });
    const actual = extractCurrentContacts(await fetchIvorisPatientById(reusableIvorisId));
    const fieldResults = buildContactVerificationResults(payload, actual);
    assertVerifiedContactResults(fieldResults);
    return { status: "skipped", ivorisId: reusableIvorisId, requestPayload: payload, fieldResults };
  }

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

  await updateIdentityClaim(db, identityFingerprint, {
    patient_id: resolvedPatientId ?? null,
    ivoris_id: ivorisId,
    last_submission_id: submission.id,
    status: "resolved",
    note: "Ivoris-Neuanlage erfolgreich abgeschlossen.",
  });

  await patchSubmissionIvorisPatientId(db, submission.id, ivorisId);
  const actual = extractCurrentContacts(await fetchIvorisPatientById(ivorisId));
  const fieldResults = buildContactVerificationResults(payload, actual);
  assertVerifiedContactResults(fieldResults);
  return { status: "success", ivorisId, requestPayload: payload, fieldResults };
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
      ivoris_field_results: result.fieldResults,
    });

    return { status: result.status, ivorisId: result.ivorisId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeSyncLog(db, submission.id, "patient", attemptNo, "error", message);
    if (error instanceof ManualReviewRequiredError || isNonRetryableIvorisResponse(message)) {
      await markStageManualReview(db, submission.id, "patient", message);
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
    const summaryText = buildAnamnesisSummaryText(submission);
    const summaryHash = buildSummaryHash(summaryText);

    console.log(
      `[ANIMASIGN][IVORIS] doc sync submission=${submission.id} patient=${patient} blobType=${
        fileData.constructor?.name ?? typeof fileData
      } bytes=${fileBytes.byteLength} base64Type=${typeof base64} base64Length=${base64.length}`
    );

    const documentPayload = {
      name: docName,
      date: docDate,
      contentBase64: base64,
    };
    let effectivePatient = patient;
    let documentId: string;

    try {
      documentId = await addIvorisDocument({
        patientIvorisId: effectivePatient,
        ...documentPayload,
      });
    } catch (error) {
      if (!isIvorisPatientNotFoundResponse(error)) {
        throw error;
      }

      const recoveredPatient = await recoverIvorisPatientIdFromDirectory(db, submission);
      if (recoveredPatient === effectivePatient) {
        throw new ManualReviewRequiredError(
          `IVORIS kennt die gespeicherte Patienten-ID ${effectivePatient} nicht mehr und die Verzeichnissuche liefert keine andere eindeutige Akte.`,
          "document"
        );
      }

      await persistRecoveredIvorisPatientLink(
        db,
        submission,
        effectivePatient,
        recoveredPatient
      );
      console.warn(
        `[ANIMASIGN][IVORIS] replaced stale patientId=${effectivePatient} with recovered patientId=${recoveredPatient} for submission=${submission.id}`
      );
      effectivePatient = recoveredPatient;
      documentId = await addIvorisDocument({
        patientIvorisId: effectivePatient,
        ...documentPayload,
      });
    }

    const shouldPersistSummaryMarker = shouldPushIvorisSummary({
      alreadySynced: submission.ivoris_summary_synced,
      previousHash: submission.ivoris_summary_hash,
      nextHash: summaryHash,
    });
    const shouldPushSummaryNote =
      shouldPersistSummaryMarker && shouldWriteIvorisSummaryNote();

    if (shouldPushSummaryNote) {
      await addIvorisKarteiEintrag({
        patientIvorisId: effectivePatient,
        date: docDate,
        text: summaryText,
        type: "Note",
      });
    }

    if (shouldPersistSummaryMarker) {
      const summaryPatch: Record<string, unknown> = {
        ivoris_summary_synced: true,
        ivoris_summary_synced_at: new Date().toISOString(),
        ivoris_summary_hash: summaryHash,
      };

      let summaryMarkError: string | null = null;
      let currentPatch = { ...summaryPatch };
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const { error } = await db
          .from("anamnese_submissions")
          .update(currentPatch)
          .eq("id", submission.id);

        if (!error) {
          summaryMarkError = null;
          break;
        }

        const missingColumn = extractMissingColumn(error.message);
        if (!missingColumn || !(missingColumn in currentPatch)) {
          summaryMarkError = error.message;
          break;
        }

        delete currentPatch[missingColumn as keyof typeof currentPatch];
        if (Object.keys(currentPatch).length === 0) {
          break;
        }
        summaryMarkError = null;
      }

      if (summaryMarkError) {
        console.warn(
          `[ANIMASIGN][IVORIS] summary marker fallback failed for submission=${submission.id}: ${summaryMarkError}`
        );
      }
    }

    await writeSyncLog(db, submission.id, "document", attemptNo, "success", null, {
      requestPayload: {
        patientIvorisId: effectivePatient,
        summaryLength: summaryText.length,
        summaryHash,
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
    if (error instanceof ManualReviewRequiredError || isNonRetryableIvorisResponse(message)) {
      await markStageManualReview(db, submission.id, "document", message);
    } else {
      await markStageFailure(db, submission.id, "document", retryCountOnFailure, message);
    }
    throw error;
  }
}

export async function syncAnimaSignSubmission(
  submissionId: string,
  options: {
    stages?: SyncStage[];
    db?: DbClient;
    stageOverrides?: Partial<Record<SyncStage, StageOverrides>>;
    workerId?: string;
  } = {}
): Promise<SubmissionSyncResult> {
  const db = options.db ?? createServerClient();
  const submission = await loadSubmission(db, submissionId);
  const requestedStages = options.stages ?? ["patient", "document"];
  const workerId = options.workerId ?? `direct-sync-${crypto.randomUUID()}`;
  const result: SubmissionSyncResult = {
    submissionId,
    patient: "skipped",
    document: "skipped",
    errors: [],
  };

  let patientIvorisId: string | null | undefined = submission.ivoris_patient_id ?? null;

  if (requestedStages.includes("patient")) {
    const claimed = await claimSpecificStageJob(db, "patient", submission.id, workerId);
    if (!claimed) {
      result.patient = "skipped";
    } else {
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
  }

  if (requestedStages.includes("document")) {
    const claimed = await claimSpecificStageJob(db, "document", submission.id, workerId);
    if (!claimed) {
      result.document = "skipped";
    } else {
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
  }

  return result;
}

async function claimSpecificStageJob(
  db: DbClient,
  stage: SyncStage,
  submissionId: string,
  workerId: string
) {
  const { data, error } = await db.rpc("claim_integration_outbox_job_for_artifact", {
    p_artifact_type: stage,
    p_artifact_id: submissionId,
    p_worker_id: workerId,
    p_lease_minutes: 15,
    p_force: false,
  });
  if (error) throw new Error(`${stage} Job konnte nicht reserviert werden: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

async function claimPendingStageCandidate(
  db: DbClient,
  stage: SyncStage,
  workerId: string
) {
  const { data, error } = await db.rpc("claim_integration_outbox_job", {
    p_artifact_type: stage,
    p_worker_id: workerId,
    p_lease_minutes: 15,
  });
  if (error) {
    throw new Error(`Pending ${stage} Job konnte nicht reserviert werden: ${error.message}`);
  }
  const claimed = Array.isArray(data) ? data[0] : null;
  return claimed
    ? {
        id: String((claimed as { artifact_id: string }).artifact_id),
        attemptCount: Number((claimed as { attempt_count?: number | null }).attempt_count ?? 0),
      }
    : null;
}

export async function runNextPendingAnimaSignStage(
  stage: SyncStage,
  options: {
    db?: DbClient;
    excludeSubmissionIds?: string[];
    workerId?: string;
  } = {}
): Promise<NextStageSyncResult> {
  const db = options.db ?? createServerClient();
  const workerId = options.workerId ?? `animasign-${crypto.randomUUID()}`;
  const next = await claimPendingStageCandidate(
    db,
    stage,
    workerId
  );

  if (!next) {
    return { stage, found: false, reason: "Keine faellige Submission" };
  }

  const attemptNo = next.attemptCount + 1;

  try {
    return {
      stage,
      found: true,
      submissionId: next.id,
      result: await syncAnimaSignSubmission(next.id, {
        db,
        stages: [stage],
        workerId,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const guardedMessage = `Worker hat unerwarteten ${stage}-Fehler abgefangen: ${message}`;

    await writeSyncLog(db, next.id, stage, attemptNo, "error", guardedMessage, {
      metadata: {
        source: "runNextPendingAnimaSignStage",
        unexpectedWorkerFailure: true,
      },
    });
    await markStageFailure(db, next.id, stage, attemptNo, guardedMessage);

    return {
      stage,
      found: true,
      submissionId: next.id,
      reason: guardedMessage,
      result: {
        submissionId: next.id,
        patient: stage === "patient" ? "error" : "skipped",
        document: stage === "document" ? "error" : "skipped",
        errors: [guardedMessage],
      },
    };
  }
}

export async function retryPendingAnimaSignSyncs(
  options: {
    db?: DbClient;
    limit?: number;
  } = {}
) {
  const db = options.db ?? createServerClient();
  const limit = Math.max(1, Math.min(150, options.limit ?? 25));
  const workerId = `manual-retry-${crypto.randomUUID()}`;
  const summaries: SubmissionSyncResult[] = [];
  const stages: SyncStage[] = ["patient", "document"];
  let consecutiveEmptyStages = 0;
  let stageIndex = 0;

  while (summaries.length < limit && consecutiveEmptyStages < stages.length) {
    const stage = stages[stageIndex % stages.length];
    stageIndex += 1;
    const next = await runNextPendingAnimaSignStage(stage, { db, workerId });
    if (!next.found || !next.result) {
      consecutiveEmptyStages += 1;
      continue;
    }
    consecutiveEmptyStages = 0;
    summaries.push(next.result);
  }

  return {
    processed: summaries.length,
    patientSuccess: summaries.filter((entry) => entry.patient === "success").length,
    documentSuccess: summaries.filter((entry) => entry.document === "success").length,
    failures: summaries.filter((entry) => entry.errors.length > 0).length,
    results: summaries,
  };
}
