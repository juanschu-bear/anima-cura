import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { requirePraxisRole } from "@/lib/require-praxis";

type ResolveBody = {
  keepSubmissionId?: string | null;
  closeSubmissionIds?: string[] | null;
};

export async function POST(request: Request) {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  let body: ResolveBody;
  try {
    body = (await request.json()) as ResolveBody;
  } catch {
    return NextResponse.json({ error: "Ungueltiger JSON-Body" }, { status: 400 });
  }

  const keepSubmissionId =
    typeof body.keepSubmissionId === "string" && body.keepSubmissionId.trim()
      ? body.keepSubmissionId.trim()
      : null;
  const closeSubmissionIds = Array.isArray(body.closeSubmissionIds)
    ? body.closeSubmissionIds
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
    : [];

  if (!keepSubmissionId || closeSubmissionIds.length === 0) {
    return NextResponse.json(
      { error: "Bitte Referenz-Fall und mindestens einen zu schliessenden Dublettenfall angeben." },
      { status: 400 }
    );
  }

  const db = createServerClient();
  const reason = `Automatisch als Duplikat geschlossen: es existiert bereits der gueltige Referenzfall ${keepSubmissionId}.`;

  const { data, error } = await db
    .from("anamnese_submissions")
    .update({
      status: "fehler",
      fehler_text: reason,
      documenso_recipient_token: null,
      documenso_envelope_id: null,
    })
    .in("id", closeSubmissionIds)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    closed: (data ?? []).map((row) => row.id),
    kept: keepSubmissionId,
  });
}
