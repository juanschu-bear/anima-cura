import { createServerClient } from "@/lib/db/supabase";
import { resolveIntakeIdentity } from './intake-identity';

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

export async function ensureLinkedLocalPatientForSubmission(db: DbClient, submission: SubmissionIdentity) {
  const resolution = await resolveIntakeIdentity(db, submission.submissionId, true);
  return resolution.status === 'matched' ? resolution.patient_id! : null;
}
