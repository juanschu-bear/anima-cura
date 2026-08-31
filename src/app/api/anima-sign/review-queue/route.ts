import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";
import { stripManualReviewPrefix } from "@/lib/services/animasign-sync-status";

type SubmissionRow = {
  id: string;
  created_at: string;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  status: string | null;
  signed_pdf_path: string | null;
  ivoris_patient_id: string | null;
  matched_patient_id: string | null;
  ivoris_sync_error: string | null;
};

function normalizeNamePart(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function identityKey(row: Pick<SubmissionRow, "vorname" | "nachname" | "geburtsdatum">) {
  return [
    normalizeNamePart(row.vorname),
    normalizeNamePart(row.nachname),
    row.geburtsdatum ?? "",
  ].join("|");
}

function isSigned(row: SubmissionRow) {
  return row.status === "signiert" || Boolean(row.signed_pdf_path);
}

function isPending(row: SubmissionRow) {
  return !row.signed_pdf_path && (row.status === "signatur_ausstehend" || row.status === "offen");
}

export async function GET() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  const db = createServerClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("anamnese_submissions")
    .select(
      "id, created_at, vorname, nachname, geburtsdatum, status, signed_pdf_path, ivoris_patient_id, matched_patient_id, ivoris_sync_error"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as SubmissionRow[];
  const groups = new Map<string, SubmissionRow[]>();
  for (const row of rows) {
    if (!row.geburtsdatum || !normalizeNamePart(row.vorname) || !normalizeNamePart(row.nachname)) {
      continue;
    }
    const key = identityKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const duplicateGroups = Array.from(groups.entries())
    .map(([key, groupRows]) => {
      const signed = groupRows.filter(isSigned).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const pending = groupRows.filter(isPending).sort((a, b) => a.created_at.localeCompare(b.created_at));
      const canAutoClose = signed.length >= 1 && pending.length >= 1;
      return {
        key,
        patient_name: `${groupRows[0]?.vorname ?? ""} ${groupRows[0]?.nachname ?? ""}`.trim(),
        geburtsdatum: groupRows[0]?.geburtsdatum ?? null,
        total: groupRows.length,
        signed_count: signed.length,
        pending_count: pending.length,
        can_auto_close: canAutoClose,
        canonical_submission_id: canAutoClose ? signed[0]?.id ?? null : null,
        rows: groupRows.slice(0, 6),
      };
    })
    .filter((group) => group.total > 1)
    .sort((a, b) => Number(b.can_auto_close) - Number(a.can_auto_close) || b.total - a.total)
    .slice(0, 20);

  const manualReview = rows
    .filter((row) => typeof row.ivoris_sync_error === "string" && row.ivoris_sync_error.startsWith("MANUAL_REVIEW:"))
    .map((row) => ({
      id: row.id,
      patient_name: `${row.vorname ?? ""} ${row.nachname ?? ""}`.trim(),
      geburtsdatum: row.geburtsdatum,
      created_at: row.created_at,
      status: row.status,
      reason: stripManualReviewPrefix(row.ivoris_sync_error),
      matched_patient_id: row.matched_patient_id,
      ivoris_patient_id: row.ivoris_patient_id,
    }))
    .slice(0, 20);

  return NextResponse.json({
    duplicateGroups,
    manualReview,
  });
}
