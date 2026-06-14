import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SubmitBody = {
  patientId?: string | null;
  answers?: Record<string, unknown>;
  schema?: { meds?: unknown; consents?: unknown } | null;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmitBody;
    const answers = body.answers;

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { ok: false, error: "answers fehlt oder ist ungültig" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const patientId =
      typeof body.patientId === "string" && UUID_RE.test(body.patientId)
        ? body.patientId
        : null;

    const vorname = asString(answers["patient_vorname"]);
    const nachname = asString(answers["patient_nachname"]);
    const email = asString(answers["patient_email"]);
    const geburtsdatum = asString(answers["patient_geburtsdatum"]);

    // 1) Einreichung speichern
    const { data: sub, error: insertError } = await supabase
      .from("anamnese_submissions")
      .insert({
        patient_id: patientId,
        vorname,
        nachname,
        email,
        geburtsdatum,
        answers,
        status: "offen",
      })
      .select("id")
      .single();

    if (insertError || !sub) {
      return NextResponse.json(
        {
          ok: false,
          error: `Speichern fehlgeschlagen: ${insertError?.message ?? "unbekannt"}`,
        },
        { status: 500 }
      );
    }

    const submissionId = sub.id as string;

    // 2) PDF beim PDF-Dienst rendern lassen
    const pdfBaseUrl = process.env.ANIMASIGN_PDF_URL;
    const pdfKey = process.env.ANIMASIGN_PDF_KEY;

    if (!pdfBaseUrl || !pdfKey) {
      await supabase
        .from("anamnese_submissions")
        .update({
          status: "fehler",
          fehler_text: "ANIMASIGN_PDF_URL oder ANIMASIGN_PDF_KEY fehlt",
        })
        .eq("id", submissionId);
      return NextResponse.json(
        { ok: false, id: submissionId, error: "PDF-Dienst nicht konfiguriert" },
        { status: 500 }
      );
    }

    const dateipart = nachname
      ? nachname.replace(/[^\p{L}\p{N}_-]/gu, "_")
      : submissionId;

    let pdfBuffer: Buffer;
    try {
      const pdfResponse = await fetch(`${pdfBaseUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": pdfKey,
        },
        body: JSON.stringify({
          answers,
          schema: body.schema ?? null,
          filename: `Anamnesebogen_${dateipart}.pdf`,
        }),
      });

      if (!pdfResponse.ok) {
        throw new Error(`PDF-Dienst antwortete mit ${pdfResponse.status}`);
      }

      pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    } catch (pdfError) {
      await supabase
        .from("anamnese_submissions")
        .update({ status: "fehler", fehler_text: `PDF: ${String(pdfError)}` })
        .eq("id", submissionId);
      return NextResponse.json(
        {
          ok: false,
          id: submissionId,
          error: `PDF-Erzeugung fehlgeschlagen: ${String(pdfError)}`,
        },
        { status: 502 }
      );
    }

    // 3) PDF im Supabase-Storage ablegen
    const pdfPath = `${submissionId}/Anamnesebogen.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("anamnese-dokumente")
      .upload(pdfPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      await supabase
        .from("anamnese_submissions")
        .update({
          status: "fehler",
          fehler_text: `Storage: ${uploadError.message}`,
        })
        .eq("id", submissionId);
      return NextResponse.json(
        {
          ok: false,
          id: submissionId,
          error: `Speichern des PDF fehlgeschlagen: ${uploadError.message}`,
        },
        { status: 500 }
      );
    }

    // 4) Einreichung aktualisieren
    await supabase
      .from("anamnese_submissions")
      .update({ signed_pdf_path: pdfPath, status: "signatur_ausstehend" })
      .eq("id", submissionId);

    return NextResponse.json({ ok: true, id: submissionId, pdf_path: pdfPath });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
