import { createServerClient } from "@/lib/db/supabase";

type DbClient = ReturnType<typeof createServerClient>;

type Answers = Record<string, unknown>;

type SubmissionIdentity = {
  submissionId: string;
  patientId?: string | null;
  matchedPatientId?: string | null;
  ivorisId?: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  email: string | null;
  createdAt: string | null;
  answers: Answers;
};

type SubmissionMatchResult = {
  is_new?: boolean;
  patient_id?: string | null;
  patient_name?: string | null;
  changes?: Record<string, unknown> | null;
};

export type SubmissionPatientPatch = {
  anrede?: string;
  geschlecht?: "m" | "w" | "d";
  telefon?: string;
  email?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  mobiltelefon?: string;
  eb2_anrede?: string;
  versicherter_vorname?: string;
  versicherter_nachname?: string;
  versicherter_anrede?: string;
  versicherter_geburtsdatum?: string;
  versicherter_strasse?: string;
  versicherter_plz?: string;
  versicherter_ort?: string;
  versicherter_telefon?: string;
  versicherter_email?: string;
  eb2_vorname?: string;
  eb2_nachname?: string;
  eb2_telefon?: string;
  eb2_email?: string;
  versicherungsart?: string;
  krankenkasse?: string;
  zusatzversicherung?: string;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizePersonValue(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toIsoDateOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizePatientGender(value: string | null): "m" | "w" | "d" | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v.startsWith("m")) return "m";
  if (v.startsWith("w")) return "w";
  if (v.startsWith("d")) return "d";
  return null;
}

function normalizeVersicherungsart(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("gesetzlich")) return "gesetzlich";
  if (v.includes("privat")) return "privat";
  if (v.includes("beihilfe")) return "beihilfe";
  if (v.includes("selbstzahler")) return "selbstzahler";
  return value;
}

function mapPatientKasse(value: string | null): "privat" | "gesetzlich" {
  const normalized = normalizeVersicherungsart(value);
  return normalized === "gesetzlich" ? "gesetzlich" : "privat";
}

function buildPatientStreet(answers: Answers) {
  return [answers.patient_strasse, answers.patient_hausnummer]
    .map(asString)
    .filter(Boolean)
    .join(" ")
    .trim() || null;
}

export function buildSubmissionPatientPatch(answers: Answers): SubmissionPatientPatch {
  const patch: SubmissionPatientPatch = {};
  const set = <K extends keyof SubmissionPatientPatch>(
    key: K,
    value: SubmissionPatientPatch[K] | null
  ): void => {
    if (value !== null) patch[key] = value;
  };

  const gender = normalizePatientGender(asString(answers.patient_geschlecht));
  set("anrede", asString(answers.patient_anrede));
  if (gender) patch.geschlecht = gender;
  set("telefon", asString(answers.patient_telefon));
  set("email", asString(answers.patient_email));
  set("mobiltelefon", asString(answers.patient_mobil));
  set("strasse", buildPatientStreet(answers));
  set("plz", asString(answers.patient_plz));
  set("ort", asString(answers.patient_wohnort));

  set("versicherter_vorname", asString(answers.vp_vorname));
  set("versicherter_nachname", asString(answers.vp_nachname));
  set("versicherter_anrede", asString(answers.vp_anrede));
  set("versicherter_geburtsdatum", asString(answers.vp_geburtsdatum));

  const versicherterStrasse = [answers.vp_strasse, answers.vp_hausnummer]
    .map(asString)
    .filter(Boolean)
    .join(" ")
    .trim();
  if (versicherterStrasse) patch.versicherter_strasse = versicherterStrasse;

  set("versicherter_plz", asString(answers.vp_plz));
  set("versicherter_ort", asString(answers.vp_wohnort));
  set("versicherter_telefon", asString(answers.vp_telefon));
  set("versicherter_email", asString(answers.vp_email));

  set("eb2_vorname", asString(answers.vp2_vorname));
  set("eb2_nachname", asString(answers.vp2_nachname));
  set("eb2_anrede", asString(answers.vp2_anrede));
  set("eb2_telefon", asString(answers.vp2_telefon));
  set("eb2_email", asString(answers.vp2_email));

  set("versicherungsart", normalizeVersicherungsart(asString(answers.versicherungsart)));
  set("krankenkasse", asString(answers.krankenkasse));
  set("zusatzversicherung", asString(answers.zusatzversicherung));

  return patch;
}

async function patchSubmissionResolvedPatient(
  db: DbClient,
  submissionId: string,
  patientId: string,
  isNew: boolean
) {
  const { error } = await db
    .from("anamnese_submissions")
    .update({
      patient_id: patientId,
      matched_patient_id: patientId,
      is_existing: !isNew,
    })
    .eq("id", submissionId);

  if (error) {
    throw new Error(`Submission-Verknüpfung konnte nicht gespeichert werden: ${error.message}`);
  }
}

async function rerunSubmissionMatch(
  db: DbClient,
  submissionId: string
): Promise<SubmissionMatchResult | null> {
  const { data, error } = await db.rpc("abgleich_patient_aus_submission", {
    p_submission_id: submissionId,
  });
  if (error) {
    throw new Error(`Submission-Abgleich fehlgeschlagen: ${error.message}`);
  }
  return (data as SubmissionMatchResult | null) ?? null;
}

async function findExactLocalPatientId(
  db: DbClient,
  params: Pick<SubmissionIdentity, "vorname" | "nachname" | "geburtsdatum">
) {
  const birthday = toIsoDateOrNull(params.geburtsdatum);
  const firstname = normalizePersonValue(params.vorname);
  const lastname = normalizePersonValue(params.nachname);

  if (!birthday || !firstname || !lastname) return null;

  const { data, error } = await db
    .from("patients")
    .select("id, vorname, nachname, geburtsdatum")
    .eq("geburtsdatum", birthday)
    .limit(20);

  if (error) {
    throw new Error(`Lokaler Patientenabgleich fehlgeschlagen: ${error.message}`);
  }

  const matches = (data ?? []).filter((row) => (
    normalizePersonValue(row.vorname) === firstname &&
    normalizePersonValue(row.nachname) === lastname &&
    toIsoDateOrNull(row.geburtsdatum) === birthday
  ));

  if (matches.length === 1) return matches[0].id as string;
  return null;
}

async function findPatientByIvorisId(db: DbClient, ivorisId: string | null | undefined) {
  if (!ivorisId) return null;
  const { data, error } = await db
    .from("patients")
    .select("id")
    .eq("ivoris_id", ivorisId)
    .maybeSingle();

  if (error) {
    throw new Error(`Suche per ivoris_id fehlgeschlagen: ${error.message}`);
  }

  return data?.id ?? null;
}

export async function ensureLinkedLocalPatientForSubmission(
  db: DbClient,
  submission: SubmissionIdentity
) {
  const alreadyLinked = submission.matchedPatientId ?? submission.patientId ?? null;
  if (alreadyLinked) {
    const hasCompleteLink = Boolean(submission.matchedPatientId) && Boolean(submission.patientId);
    if (!hasCompleteLink) {
      await patchSubmissionResolvedPatient(db, submission.submissionId, alreadyLinked, false);
    }
    return alreadyLinked;
  }

  const abgleich = await rerunSubmissionMatch(db, submission.submissionId);
  if (abgleich?.patient_id) {
    await patchSubmissionResolvedPatient(
      db,
      submission.submissionId,
      abgleich.patient_id,
      Boolean(abgleich.is_new)
    );
    return abgleich.patient_id;
  }

  const byIvorisId = await findPatientByIvorisId(db, submission.ivorisId);
  if (byIvorisId) {
    await patchSubmissionResolvedPatient(db, submission.submissionId, byIvorisId, false);
    return byIvorisId;
  }

  const byIdentity = await findExactLocalPatientId(db, submission);
  if (byIdentity) {
    await patchSubmissionResolvedPatient(db, submission.submissionId, byIdentity, false);
    return byIdentity;
  }

  const today = toIsoDateOrNull(submission.createdAt) ?? new Date().toISOString().slice(0, 10);
  const patch = buildSubmissionPatientPatch(submission.answers);

  const insertPayload = {
    ivoris_id: submission.ivorisId ?? null,
    vorname: asString(submission.vorname) ?? "Unbekannt",
    nachname: asString(submission.nachname) ?? "Patient",
    geburtsdatum: toIsoDateOrNull(submission.geburtsdatum) ?? today,
    geschlecht: patch.geschlecht ?? "m",
    kasse: mapPatientKasse(asString(submission.answers.versicherungsart)),
    telefon: patch.telefon ?? patch.mobiltelefon ?? null,
    email: submission.email ?? patch.email ?? null,
    strasse: patch.strasse ?? null,
    plz: patch.plz ?? null,
    ort: patch.ort ?? null,
    behandlung: asString(submission.answers.besuchsgrund) ?? "Neuaufnahme",
    behandlung_start: today,
    behandlung_status: "aktiv",
    notizen: "Automatisch aus digitalem Anamnesebogen angelegt.",
  };

  const { data, error } = await db
    .from("patients")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error(`Lokaler Patient konnte nicht angelegt werden: ${error?.message ?? "unbekannt"}`);
  }

  await patchSubmissionResolvedPatient(db, submission.submissionId, data.id as string, true);
  return data.id as string;
}
