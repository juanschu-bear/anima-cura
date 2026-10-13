import { loadEnvConfig } from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { createServerClient } from "../src/lib/db/supabase";
import { parseBillingCaseKey } from "../src/lib/billing-publish";

loadEnvConfig(process.cwd());

const unresolvedManifestSchema = z.object({
  audit_at: z.string().datetime(),
  issued: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  rows: z.array(z.object({
    case_key: z.string().min(1),
    file: z.string().min(1),
    draft_pages: z.number().int().positive().optional(),
    total_pages: z.number().int().positive().optional(),
    patient_id: z.string().uuid().nullable(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/i),
    cents: z.number().int().positive(),
    published: z.boolean().optional(),
  })).min(1),
}).passthrough();

function argument(name: string) {
  const prefix = `${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function chunks<T>(input: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < input.length; index += size) result.push(input.slice(index, index + size));
  return result;
}

function normalizeName(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
}

async function main() {
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith("--manifest=") && !value.startsWith("--audit=") && !value.startsWith("--output=") && !value.startsWith("--review=") && !value.startsWith("--overrides=")) {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  const manifestPath = argument("--manifest");
  const outputPath = argument("--output");
  const auditPath = argument("--audit");
  const reviewPath = argument("--review");
  const overridesPath = argument("--overrides");
  if (!manifestPath || !outputPath || !auditPath) {
    throw new Error("Use --manifest=/private/source.json --audit=/private/audit.json --output=/private/resolved.json");
  }
  const manifest = unresolvedManifestSchema.parse(JSON.parse(await readFile(resolve(manifestPath), "utf8")));
  const audit = z.object({
    rows: z.array(z.object({ case_key: z.string(), display_name: z.string().min(1) })),
  }).parse(JSON.parse(await readFile(resolve(auditPath), "utf8")));
  const displayNameByCase = new Map(audit.rows.map(row => [row.case_key, row.display_name]));
  const overrideFile = overridesPath
    ? z.object({ overrides: z.record(z.object({ patient_id: z.string().uuid(), evidence: z.string().min(20) })) })
      .parse(JSON.parse(await readFile(resolve(overridesPath), "utf8")))
    : { overrides: {} };
  const usedOverrides = new Set<string>();
  const expectedNumbers = Array.from(new Set(manifest.rows.map(row => parseBillingCaseKey(row.case_key).patientNumber)));
  const existingIds = Array.from(new Set(manifest.rows.flatMap(row => row.patient_id ? [row.patient_id] : [])));
  const db = createServerClient();
  const patientRows: Array<{ id: string; ivoris_nummer: string | null; vorname: string | null; nachname: string | null }> = [];
  for (const batch of chunks(expectedNumbers, 150)) {
    const { data, error } = await db.from("patients").select("id,ivoris_nummer,vorname,nachname").in("ivoris_nummer", batch);
    if (error) throw new Error(`Patient number lookup failed: ${error.message}`);
    patientRows.push(...((data ?? []) as typeof patientRows));
  }
  const existingPatientRows: Array<{ id: string; ivoris_nummer: string | null }> = [];
  for (const batch of chunks(existingIds, 150)) {
    const { data, error } = await db.from("patients").select("id,ivoris_nummer").in("id", batch);
    if (error) throw new Error(`Existing patient lookup failed: ${error.message}`);
    existingPatientRows.push(...((data ?? []) as Array<{ id: string; ivoris_nummer: string | null }>));
  }
  const patientById = new Map(existingPatientRows.map(patient => [patient.id, patient]));
  const allPatients: typeof patientRows = [];
  for (let page = 0; ; page += 1) {
    const from = page * 1000;
    const { data, error } = await db.from("patients")
      .select("id,ivoris_nummer,vorname,nachname")
      .range(from, from + 999);
    if (error) throw new Error(`Patient name lookup failed: ${error.message}`);
    const batch = (data ?? []) as typeof patientRows;
    allPatients.push(...batch);
    if (batch.length < 1000) break;
  }
  const patientsByName = new Map<string, typeof patientRows>();
  for (const patient of allPatients) {
    if (!patient.vorname || !patient.nachname) continue;
    const key = normalizeName(`${patient.nachname}, ${patient.vorname}`);
    patientsByName.set(key, [...(patientsByName.get(key) ?? []), patient]);
  }
  const idsByNumber = new Map<string, string[]>();
  for (const patient of patientRows) {
    if (!patient.ivoris_nummer) continue;
    const normalized = patient.ivoris_nummer.replace(/\D/g, "").padStart(8, "0");
    idsByNumber.set(normalized, [...(idsByNumber.get(normalized) ?? []), patient.id]);
  }

  let added = 0;
  let verified = 0;
  let verifiedWithoutNumber = 0;
  let addedByNumber = 0;
  let addedByName = 0;
  let addedByOverride = 0;
  const unresolved: string[] = [];
  const conflicts: string[] = [];
  const rows = manifest.rows.map(row => {
    const patientNumber = parseBillingCaseKey(row.case_key).patientNumber.padStart(8, "0");
    if (row.patient_id) {
      const existing = patientById.get(row.patient_id);
      if (!existing) {
        unresolved.push(row.case_key);
        return row;
      }
      if (existing.ivoris_nummer) {
        const existingNumber = existing.ivoris_nummer.replace(/\D/g, "").padStart(8, "0");
        if (existingNumber !== patientNumber) {
          conflicts.push(row.case_key);
          return row;
        }
        verified += 1;
      } else {
        verifiedWithoutNumber += 1;
      }
      return row;
    }
    const candidates = idsByNumber.get(patientNumber) ?? [];
    if (candidates.length === 1) {
      added += 1;
      addedByNumber += 1;
      return { ...row, patient_id: candidates[0] };
    }
    const displayName = displayNameByCase.get(row.case_key);
    const nameCandidates = displayName ? (patientsByName.get(normalizeName(displayName)) ?? []) : [];
    const compatible = nameCandidates.filter(candidate => {
      if (!candidate.ivoris_nummer) return true;
      return candidate.ivoris_nummer.replace(/\D/g, "").padStart(8, "0") === patientNumber;
    });
    if (compatible.length === 1) {
      added += 1;
      addedByName += 1;
      return { ...row, patient_id: compatible[0].id };
    }
    const override = overrideFile.overrides[row.case_key];
    if (override) {
      const selected = compatible.find(candidate => candidate.id === override.patient_id);
      if (!selected) {
        conflicts.push(row.case_key);
        return row;
      }
      usedOverrides.add(row.case_key);
      added += 1;
      addedByOverride += 1;
      return { ...row, patient_id: selected.id };
    }
    if (nameCandidates.length === 1 && compatible.length === 0) conflicts.push(row.case_key);
    else unresolved.push(row.case_key);
    return row;
  });

  if (unresolved.length || conflicts.length) {
    if (reviewPath) {
      const privateReview = {
        created_at: new Date().toISOString(),
        unresolved: unresolved.map(caseKey => ({ case_key: caseKey, display_name: displayNameByCase.get(caseKey) ?? null })),
        conflicts: conflicts.map(caseKey => ({ case_key: caseKey, display_name: displayNameByCase.get(caseKey) ?? null })),
      };
      await writeFile(resolve(reviewPath), `${JSON.stringify(privateReview, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    }
    throw new Error(`Patient resolution blocked: ${unresolved.length} unresolved, ${conflicts.length} conflicts`);
  }
  const unusedOverrides = Object.keys(overrideFile.overrides).filter(caseKey => !usedOverrides.has(caseKey));
  if (unusedOverrides.length) throw new Error(`Patient resolution blocked: ${unusedOverrides.length} unused overrides`);
  const result = {
    ...manifest,
    patient_resolution: {
      resolved_at: new Date().toISOString(),
      method: "exact patients.ivoris_nummer",
      verified,
      verified_without_number: verifiedWithoutNumber,
      added,
      added_by_number: addedByNumber,
      added_by_exact_name: addedByName,
      added_by_reviewed_override: addedByOverride,
      unresolved: 0,
      conflicts: 0,
    },
    rows,
  };
  await writeFile(resolve(outputPath), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ total: rows.length, verified, verifiedWithoutNumber, added, addedByNumber, addedByName, addedByOverride, unresolved: 0, conflicts: 0 }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Patient resolution failed");
  process.exitCode = 1;
});
