import { createServerClient } from "../db/supabase";
import { fetchIvorisPatientsRaw } from "../api/ivoris-client";

type GenericRecord = Record<string, unknown>;

type NormalizedPatient = {
  ivoris_id: string;
  vorname: string;
  nachname: string;
  geburtsdatum: string;
  kasse: "privat" | "gesetzlich";
  behandlung: string;
  behandlung_start: string;
  geschlecht?: "m" | "w" | "d";
  versichertennummer?: string | null;
  telefon?: string | null;
  email?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  land?: string | null;
  notizen?: string | null;
};

function asArray(payload: unknown): GenericRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter((x): x is GenericRecord => Boolean(x && typeof x === "object"));
  }

  if (payload && typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;
    const listKeys = ["patients", "patienten", "data", "items", "result"];
    for (const key of listKeys) {
      if (Array.isArray(candidate[key])) {
        return (candidate[key] as unknown[]).filter((x): x is GenericRecord => Boolean(x && typeof x === "object"));
      }
    }
  }

  return [];
}

function pickString(source: GenericRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function parseDate(input: string | null): string | null {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function mapGender(raw: string | null): "m" | "w" | "d" | undefined {
  if (!raw) return undefined;
  const value = raw.toLowerCase();
  if (["m", "male", "mann", "männlich"].includes(value)) return "m";
  if (["w", "f", "female", "frau", "weiblich"].includes(value)) return "w";
  if (["d", "divers"].includes(value)) return "d";
  return undefined;
}

function mapInsurance(raw: string | null): "privat" | "gesetzlich" {
  if (!raw) return "privat";
  const value = raw.toLowerCase();
  if (value.includes("gesetz")) return "gesetzlich";
  if (value.includes("gkv")) return "gesetzlich";
  return "privat";
}

function normalizePatient(raw: GenericRecord): { ok: true; patient: NormalizedPatient } | { ok: false; reason: string } {
  const ivorisId =
    pickString(raw, ["id", "patientId", "patient_id", "externalId", "nummer", "patientNumber"]) || "";
  const vorname = pickString(raw, ["vorname", "firstName", "firstname", "givenName"]) || "";
  const nachname = pickString(raw, ["nachname", "lastName", "lastname", "familyName"]) || "";
  const geburtsdatum =
    parseDate(pickString(raw, ["geburtsdatum", "birthDate", "dateOfBirth", "dob"])) || null;
  const behandlung =
    pickString(raw, ["behandlung", "treatment", "treatmentType", "therapy", "caseType"]) || "KFO";
  const behandlungStart =
    parseDate(pickString(raw, ["behandlung_start", "treatmentStart", "caseStart", "startDate"])) ||
    new Date().toISOString().slice(0, 10);

  if (!ivorisId) return { ok: false, reason: "missing ivoris_id" };
  if (!vorname || !nachname) return { ok: false, reason: `missing name for ${ivorisId}` };
  if (!geburtsdatum) return { ok: false, reason: `missing/invalid birthDate for ${ivorisId}` };

  const patient: NormalizedPatient = {
    ivoris_id: ivorisId,
    vorname,
    nachname,
    geburtsdatum,
    kasse: mapInsurance(pickString(raw, ["kasse", "insuranceType", "insurance", "payerType"])),
    behandlung,
    behandlung_start: behandlungStart,
    geschlecht: mapGender(pickString(raw, ["geschlecht", "gender", "sex"])),
    versichertennummer: pickString(raw, ["versichertennummer", "insuranceNumber", "insuranceNo"]),
    telefon: pickString(raw, ["telefon", "phone", "mobile", "tel"]),
    email: pickString(raw, ["email", "mail"]),
    strasse: pickString(raw, ["strasse", "street", "addressLine1", "address"]),
    plz: pickString(raw, ["plz", "zip", "postalCode"]),
    ort: pickString(raw, ["ort", "city"]),
    land: pickString(raw, ["land", "country"]) || "DE",
    notizen: pickString(raw, ["notizen", "notes", "comment"]),
  };

  return { ok: true, patient };
}

export async function syncIvorisPatients(): Promise<{
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
}> {
  const db = createServerClient();
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const payload = await fetchIvorisPatientsRaw();
  const sourcePatients = asArray(payload);

  if (!sourcePatients.length) {
    return { imported: 0, updated: 0, skipped: 0, errors: ["Keine Patientendaten vom IVORIS-Endpoint erhalten"] };
  }

  for (const row of sourcePatients) {
    const normalized = normalizePatient(row);
    if (!normalized.ok) {
      skipped++;
      errors.push(normalized.reason);
      continue;
    }

    const patient = normalized.patient;

    const { data: existing, error: existingError } = await db
      .from("patients")
      .select("id")
      .eq("ivoris_id", patient.ivoris_id)
      .limit(1);

    if (existingError) {
      skipped++;
      errors.push(`Lookup ${patient.ivoris_id}: ${existingError.message}`);
      continue;
    }

    if (existing?.length) {
      const { error } = await db
        .from("patients")
        .update({
          vorname: patient.vorname,
          nachname: patient.nachname,
          geburtsdatum: patient.geburtsdatum,
          kasse: patient.kasse,
          behandlung: patient.behandlung,
          behandlung_start: patient.behandlung_start,
          geschlecht: patient.geschlecht,
          versichertennummer: patient.versichertennummer,
          telefon: patient.telefon,
          email: patient.email,
          strasse: patient.strasse,
          plz: patient.plz,
          ort: patient.ort,
          land: patient.land,
          notizen: patient.notizen,
        })
        .eq("ivoris_id", patient.ivoris_id);

      if (error) {
        skipped++;
        errors.push(`Update ${patient.ivoris_id}: ${error.message}`);
      } else {
        updated++;
      }
      continue;
    }

    const { error: insertError } = await db.from("patients").insert({
      ivoris_id: patient.ivoris_id,
      vorname: patient.vorname,
      nachname: patient.nachname,
      geburtsdatum: patient.geburtsdatum,
      kasse: patient.kasse,
      behandlung: patient.behandlung,
      behandlung_start: patient.behandlung_start,
      geschlecht: patient.geschlecht,
      versichertennummer: patient.versichertennummer,
      telefon: patient.telefon,
      email: patient.email,
      strasse: patient.strasse,
      plz: patient.plz,
      ort: patient.ort,
      land: patient.land,
      notizen: patient.notizen,
    });

    if (insertError) {
      skipped++;
      errors.push(`Insert ${patient.ivoris_id}: ${insertError.message}`);
    } else {
      imported++;
    }
  }

  await db.from("alerts").insert({
    typ: "system",
    titel: `IVORIS Sync: ${imported} neu, ${updated} aktualisiert`,
    beschreibung: `Patientenimport abgeschlossen. Übersprungen: ${skipped}.${errors.length ? ` Fehler: ${errors.length}.` : ""}`,
    schweregrad: errors.length ? "warnung" : "info",
    empfaenger: "sabine",
  });

  return { imported, updated, skipped, errors };
}
