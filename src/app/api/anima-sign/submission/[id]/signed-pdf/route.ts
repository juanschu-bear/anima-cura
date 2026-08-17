import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { createServerComponentClient } from "@/lib/db/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const authClient = createServerComponentClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const serviceClient = createServerClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role, patient_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: submission, error: submissionError } = await serviceClient
    .from("anamnese_submissions")
    .select("id, vorname, nachname, signed_pdf_path, status, patient_id, matched_patient_id")
    .eq("id", params.id)
    .maybeSingle();

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 });
  }

  if (!submission) {
    return NextResponse.json({ error: "Einreichung nicht gefunden" }, { status: 404 });
  }

  const role = profile?.role ?? null;
  const allowedPatientId = submission.matched_patient_id ?? submission.patient_id ?? null;
  const isPraxisRole = role === "admin" || role === "verwaltung";
  const isOwningPatient = role === "patient" && !!profile?.patient_id && !!allowedPatientId && profile.patient_id === allowedPatientId;

  if (!isPraxisRole && !isOwningPatient) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 403 });
  }

  if (!submission.signed_pdf_path) {
    return NextResponse.json({ error: "Noch kein signiertes PDF vorhanden" }, { status: 404 });
  }

  const { data: fileData, error: fileError } = await serviceClient.storage
    .from("anamnese-dokumente")
    .download(submission.signed_pdf_path);

  if (fileError || !fileData) {
    return NextResponse.json(
      { error: `PDF konnte nicht geladen werden: ${fileError?.message ?? submission.signed_pdf_path}` },
      { status: 502 }
    );
  }

  const pdfBytes = await fileData.arrayBuffer();
  const filenameBase = [submission.nachname, submission.vorname]
    .filter(Boolean)
    .join("_")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const filename = `${filenameBase || submission.id}-Anamnesebogen-signiert.pdf`;

  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
