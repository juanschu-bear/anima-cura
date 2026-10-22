import { createAdminClient } from "@/lib/db/supabase";
import { patientIdentityMatchKind } from "@/lib/services/ivoris-sync";

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

function duplicateGroups(rows: PatientRow[]) {
  const buckets = new Map<string, PatientRow[]>();
  for (const row of rows) {
    if (!row.geburtsdatum || !normalizeNamePart(row.vorname) || !normalizeNamePart(row.nachname)) continue;
    const key = `${normalizeNamePart(row.nachname)}|${row.geburtsdatum}`;
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const groups: Array<{ key: string; rows: PatientRow[] }> = [];
  for (const [bucketKey, bucket] of Array.from(buckets.entries())) {
    const remaining = new Set(bucket.map((row: PatientRow) => row.id));
    while (remaining.size > 0) {
      const seedId = remaining.values().next().value as string;
      remaining.delete(seedId);
      const component = [bucket.find((row: PatientRow) => row.id === seedId)!];
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const candidate of bucket) {
          if (!remaining.has(candidate.id)) continue;
          const matches = component.some((member) => patientIdentityMatchKind(
            {
              ivoris_id: member.ivoris_id ?? `local:${member.id}`,
              vorname: member.vorname ?? "",
              nachname: member.nachname ?? "",
              geburtsdatum: member.geburtsdatum ?? "",
            },
            {
              id: candidate.id,
              ivoris_id: candidate.ivoris_id,
              vorname: candidate.vorname ?? "",
              nachname: candidate.nachname ?? "",
              geburtsdatum: candidate.geburtsdatum ?? "",
            }
          ) !== "none");
          if (!matches) continue;
          remaining.delete(candidate.id);
          component.push(candidate);
          expanded = true;
        }
      }
      if (component.length > 1) groups.push({ key: `${bucketKey}|${component.map((row) => row.id).sort().join(",")}`, rows: component });
    }
  }
  return groups;
}

function hasStrongContactAgreement(rows: PatientRow[]) {
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      const leftEmail = normalizeNamePart(rows[left].email);
      const rightEmail = normalizeNamePart(rows[right].email);
      if (leftEmail && leftEmail === rightEmail) return true;

      const leftPhones = new Set([compactPhone(rows[left].telefon), compactPhone(rows[left].mobiltelefon)].filter((value) => value.length >= 7));
      const rightPhones = new Set([compactPhone(rows[right].telefon), compactPhone(rows[right].mobiltelefon)].filter((value) => value.length >= 7));
      if (Array.from(leftPhones).some((phone) => rightPhones.has(phone))) return true;
    }
  }
  return false;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value ?? "").trim()).filter(Boolean)));
}

function chooseCanonical(rows: PatientRow[], refs: GroupRefSnapshot[]) {
  const ivorisLinked = rows.filter((row) => Boolean(row.ivoris_id));
  if (ivorisLinked.length === 1) return ivorisLinked[0];

  const candidates = ivorisLinked.length > 0 ? ivorisLinked : rows;

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

  return [...candidates].sort((left, right) => score(right) - score(left))[0];
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

async function mergePatientPayload(canonical: PatientRow, duplicates: PatientRow[]) {
  const db = createAdminClient();
  const mergedFirstName = [canonical, ...duplicates]
    .map((row) => row.vorname?.trim() ?? "")
    .sort((left, right) => right.length - left.length)[0] || canonical.vorname;
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
      vorname: mergedFirstName,
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

  const groups = duplicateGroups((data ?? []) as PatientRow[]);

  const candidateGroups = groups
    .sort((left, right) => right.rows.length - left.rows.length)
    .slice(0, limit);

  const preview: unknown[] = [];
  let appliedGroups = 0;

  for (const group of candidateGroups) {
    const refs = await collectReferences(group.rows.map((row) => row.id));
    const canonical = chooseCanonical(group.rows, refs);
    const duplicates = group.rows.filter((row) => row.id !== canonical.id);

    const duplicateRefTotals = duplicates.reduce((sum, row) => {
      const snapshot = refs.find((entry) => entry.patientId === row.id);
      return sum + (snapshot?.total ?? 0);
    }, 0);

    const safeToApply = hasStrongContactAgreement(group.rows);
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
      safeToApply,
    };

    preview.push(plan);

    if (!apply || !safeToApply) continue;

    await mergePatientPayload(canonical, duplicates);
    for (const duplicate of duplicates) {
      const rpc = duplicate.ivoris_id
        ? "merge_duplicate_patient_with_ivoris_alias"
        : "merge_local_patient_duplicate";
      const { error: mergeError } = await db.rpc(rpc, {
        p_source_patient_id: duplicate.id,
        p_target_patient_id: canonical.id,
        p_reason: "Deterministische Dublettenbereinigung: Name, Geburtsdatum und Kontakt stimmen ueberein",
      });
      if (mergeError) throw new Error(`Transactional merge failed for ${duplicate.id}: ${mergeError.message}`);
    }
    appliedGroups += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "preview",
        duplicateGroupCount: candidateGroups.length,
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
