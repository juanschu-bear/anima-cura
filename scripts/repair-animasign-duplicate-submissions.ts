import { createAdminClient } from "@/lib/db/supabase";

type SubmissionRow = {
  id: string;
  created_at: string;
  vorname: string | null;
  nachname: string | null;
  geburtsdatum: string | null;
  status: string | null;
  signed_pdf_path: string | null;
  fehler_text: string | null;
};

function normalizeNamePart(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function identityKey(row: SubmissionRow) {
  return [
    normalizeNamePart(row.vorname),
    normalizeNamePart(row.nachname),
    row.geburtsdatum ?? "",
  ].join("|");
}

function isSigned(row: SubmissionRow) {
  return row.status === "signiert" || Boolean(row.signed_pdf_path);
}

function isPendingDuplicate(row: SubmissionRow) {
  return (
    !row.signed_pdf_path &&
    (row.status === "signatur_ausstehend" || row.status === "offen")
  );
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.find((arg) => arg.startsWith("--days="));
  const days = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 21) : 21;
  const db = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id, created_at, vorname, nachname, geburtsdatum, status, signed_pdf_path, fehler_text")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(10000);

  if (error) throw error;

  const groups = new Map<string, SubmissionRow[]>();
  for (const row of (data ?? []) as SubmissionRow[]) {
    if (!row.geburtsdatum || !normalizeNamePart(row.vorname) || !normalizeNamePart(row.nachname)) {
      continue;
    }
    const key = identityKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const preview: unknown[] = [];
  let patched = 0;

  for (const [key, rows] of Array.from(groups.entries())) {
    if (rows.length < 2) continue;

    const signed = rows.filter(isSigned).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const pending = rows.filter(isPendingDuplicate);
    if (signed.length === 0 || pending.length === 0) continue;

    const canonical = signed[0];
    const stalePending = pending.filter((row) => row.id !== canonical.id);
    if (stalePending.length === 0) continue;

    const reason = `Automatisch als Duplikat geschlossen: fuer diese Identitaet existiert bereits eine spaetere signierte Einreichung (${canonical.id}).`;
    preview.push({
      key,
      canonical: {
        id: canonical.id,
        created_at: canonical.created_at,
        status: canonical.status,
      },
      stalePending: stalePending.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        status: row.status,
      })),
      action: "mark_pending_duplicates_as_error",
    });

    if (!apply) continue;

    for (const row of stalePending) {
      const { error: updateError } = await db
        .from("anamnese_submissions")
        .update({
          status: "fehler",
          fehler_text: reason,
          documenso_recipient_token: null,
          documenso_envelope_id: null,
        })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Duplicate submission ${row.id} konnte nicht bereinigt werden: ${updateError.message}`);
      }
      patched += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "apply" : "preview",
        duplicateGroupCount: preview.length,
        patched,
        preview,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[repair-animasign-duplicate-submissions] fatal", error);
  process.exit(1);
});
