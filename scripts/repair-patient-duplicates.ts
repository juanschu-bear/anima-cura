import { createAdminClient } from "@/lib/db/supabase";

type PatientRow = {
  id: string;
  ivoris_id: string | null;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  email?: string | null;
  telefon?: string | null;
  mobiltelefon?: string | null;
  notizen?: string | null;
  created_at?: string | null;
};

type RefTarget = {
  table: string;
  column: string;
};

type GroupRefSnapshot = {
  patientId: string;
  counts: Record<string, number>;
  total: number;
};

const REF_TARGETS: RefTarget[] = [
  { table: "user_profiles", column: "patient_id" },
  { table: "anamnese_submissions", column: "patient_id" },
  { table: "anamnese_submissions", column: "matched_patient_id" },
  { table: "offene_posten", column: "patient_id" },
  { table: "raten", column: "patient_id" },
  { table: "ratenplaene", column: "patient_id" },
  { table: "transaktionen", column: "matched_patient_id" },
  { table: "ki_analysen", column: "patient_id" },
  { table: "behandlungsfall", column: "patient_id" },
  { table: "doku_eintraege", column: "patient_id" },
  { table: "patient_documents", column: "patient_id" },
  { table: "behandlungsphasen", column: "patient_id" },
  { table: "patient_messages", column: "patient_id" },
  { table: "patient_notifications", column: "patient_id" },
  { table: "push_subscriptions", column: "patient_id" },
  { table: "patient_engagement", column: "patient_id" },
  { table: "patient_consents", column: "patient_id" },
  { table: "anima_balance_buchungen", column: "patient_id" },
  { table: "mahnungen", column: "patient_id" },
  { table: "kassen_zahlungen", column: "patient_id" },
];

function normalizeNamePart(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function compactPhone(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function identityKey(row: PatientRow) {
  return [
    normalizeNamePart(row.vorname),
    normalizeNamePart(row.nachname),
    row.geburtsdatum ?? "",
  ].join("|");
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value ?? "").trim()).filter(Boolean)));
}

function chooseCanonical(rows: PatientRow[], refs: GroupRefSnapshot[]) {
  const refById = new Map(refs.map((entry) => [entry.patientId, entry]));
  const score = (row: PatientRow) => {
    const refTotal = refById.get(row.id)?.total ?? 0;
    const hasPortal = (refById.get(row.id)?.counts["user_profiles.patient_id"] ?? 0) > 0 ? 1 : 0;
    const richness =
      (row.email ? 1 : 0) +
      (compactPhone(row.telefon).length > 0 ? 1 : 0) +
      (compactPhone(row.mobiltelefon).length > 0 ? 1 : 0) +
      (row.ivoris_id ? 1 : 0);
    const created = row.created_at ? new Date(row.created_at).getTime() : Number.MAX_SAFE_INTEGER;
    return refTotal * 10_000 + hasPortal * 1_000 + richness * 100 - created / 1_000_000_000_000;
  };

  return [...rows].sort((left, right) => score(right) - score(left))[0];
}

async function collectReferences(ids: string[]) {
  const db = createAdminClient();
  const snapshots = new Map<string, GroupRefSnapshot>(
    ids.map((patientId) => [patientId, { patientId, counts: {}, total: 0 }])
  );

  for (const target of REF_TARGETS) {
    const { data, error } = await db
      .from(target.table)
      .select(`id, ${target.column}`)
      .in(target.column, ids)
      .limit(5000);

    if (error) {
      console.warn(`[DEDUPE] skipped ref scan ${target.table}.${target.column}: ${error.message}`);
      continue;
    }

    const rows = ((data ?? []) as unknown[]) as Array<Record<string, unknown>>;
    for (const row of rows) {
      const patientId = row[target.column];
      if (typeof patientId !== "string") continue;
      const snapshot = snapshots.get(patientId);
      if (!snapshot) continue;
      const key = `${target.table}.${target.column}`;
      snapshot.counts[key] = (snapshot.counts[key] ?? 0) + 1;
      snapshot.total += 1;
    }
  }

  return Array.from(snapshots.values());
}

async function repointReferences(fromId: string, toId: string) {
  const db = createAdminClient();
  const results: Array<{ target: string; updated: number }> = [];

  for (const target of REF_TARGETS) {
    const { data, error } = await db
      .from(target.table)
      .update({ [target.column]: toId })
      .eq(target.column, fromId)
      .select("id");

    if (error) {
      console.warn(`[DEDUPE] repoint skipped ${target.table}.${target.column}: ${error.message}`);
      continue;
    }

    results.push({
      target: `${target.table}.${target.column}`,
      updated: (data ?? []).length,
    });
  }

  return results;
}

async function mergePatientPayload(canonical: PatientRow, duplicates: PatientRow[]) {
  const db = createAdminClient();
  const mergedEmail = canonical.email ?? duplicates.find((row) => row.email)?.email ?? null;
  const mergedTelefon =
    canonical.telefon ?? duplicates.find((row) => compactPhone(row.telefon).length > 0)?.telefon ?? null;
  const mergedMobil =
    canonical.mobiltelefon ??
    duplicates.find((row) => compactPhone(row.mobiltelefon).length > 0)?.mobiltelefon ??
    null;
  const aliasIds = uniqueValues([canonical.ivoris_id, ...duplicates.map((row) => row.ivoris_id)]);
  const aliasNote = aliasIds.length > 1 ? `Merged duplicate ivoris ids: ${aliasIds.join(", ")}` : null;
  const existingNotes = canonical.notizen?.trim() ?? "";
  const nextNotes = aliasNote
    ? existingNotes.includes(aliasNote)
      ? existingNotes
      : [existingNotes, aliasNote].filter(Boolean).join("\n")
    : existingNotes || null;

  const { error } = await db
    .from("patients")
    .update({
      email: mergedEmail,
      telefon: mergedTelefon,
      mobiltelefon: mergedMobil,
      notizen: nextNotes,
    })
    .eq("id", canonical.id);

  if (error) {
    throw new Error(`Canonical merge update failed for ${canonical.id}: ${error.message}`);
  }
}

async function deleteDuplicatePatient(patientId: string) {
  const db = createAdminClient();
  const { error } = await db.from("patients").delete().eq("id", patientId);
  if (error) {
    throw new Error(`Delete failed for duplicate patient ${patientId}: ${error.message}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 10) : 10;
  const db = createAdminClient();

  const { data, error } = await db
    .from("patients")
    .select("id, ivoris_id, vorname, nachname, geburtsdatum, email, telefon, mobiltelefon, notizen, created_at")
    .limit(10000);

  if (error) throw error;

  const groups = new Map<string, PatientRow[]>();
  for (const row of (data ?? []) as PatientRow[]) {
    if (!row.geburtsdatum || !normalizeNamePart(row.vorname) || !normalizeNamePart(row.nachname)) {
      continue;
    }
    const key = identityKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const duplicateGroups = Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }))
    .sort((left, right) => right.rows.length - left.rows.length)
    .slice(0, limit);

  const preview: unknown[] = [];
  let appliedGroups = 0;

  for (const group of duplicateGroups) {
    const refs = await collectReferences(group.rows.map((row) => row.id));
    const canonical = chooseCanonical(group.rows, refs);
    const duplicates = group.rows.filter((row) => row.id !== canonical.id);

    const duplicateRefTotals = duplicates.reduce((sum, row) => {
      const snapshot = refs.find((entry) => entry.patientId === row.id);
      return sum + (snapshot?.total ?? 0);
    }, 0);

    const plan = {
      key: group.key,
      canonical: {
        id: canonical.id,
        ivoris_id: canonical.ivoris_id,
        vorname: canonical.vorname,
        nachname: canonical.nachname,
        geburtsdatum: canonical.geburtsdatum,
      },
      duplicates: duplicates.map((row) => ({
        id: row.id,
        ivoris_id: row.ivoris_id,
        created_at: row.created_at,
      })),
      references: refs,
      duplicateRefTotals,
      safeToApply: true,
    };

    preview.push(plan);

    if (!apply) continue;

    await mergePatientPayload(canonical, duplicates);
    for (const duplicate of duplicates) {
      await repointReferences(duplicate.id, canonical.id);
      await deleteDuplicatePatient(duplicate.id);
    }
    appliedGroups += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "preview",
        duplicateGroupCount: duplicateGroups.length,
        appliedGroups,
        preview,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
