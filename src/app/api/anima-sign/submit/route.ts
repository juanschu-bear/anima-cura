import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import {
  createAndDistribute,
  type DocumensoField,
} from "@/lib/documenso/client";

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

// Seitenzahl aus dem PDF zaehlen (WeasyPrint liefert klassische Seitenobjekte).
function countPdfPages(pdf: Buffer): number {
  try {
    const text = pdf.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page(?![s])/g);
    const n = matches ? matches.length : 0;
    return n > 0 ? n : 1;
  } catch {
    return 1;
  }
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

    const dateipart = (nachname ?? submissionId).replace(
      /[^A-Za-z0-9\u00C0-\u017F_-]/g,
      "_"
    );
    const pdfFilename = `Anamnesebogen_${dateipart}.pdf`;

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
          filename: pdfFilename,
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

    // 3) Unsigniertes PDF im Storage ablegen (unser Beleg + Vorlage fuer Documenso)
    const unsignedPath = `${submissionId}/Anamnesebogen.pdf`;
    await supabase.storage
      .from("anamnese-dokumente")
      .upload(unsignedPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    // 4) Documenso-Envelope anlegen, verteilen, Signier-Link holen
    const patientName =
      [vorname, nachname].filter(Boolean).join(" ").trim() || "Patient";
    const lastPage = countPdfPages(pdfBuffer);
    const fields: DocumensoField[] = [
      { type: "SIGNATURE", page: lastPage, positionX: 8, positionY: 80, width: 38, height: 9 },
      { type: "DATE", page: lastPage, positionX: 55, positionY: 82, width: 28, height: 5 },
    ];

    try {
      const signing = await createAndDistribute({
        title: `Anamnesebogen ${patientName}`.trim(),
        externalId: submissionId,
        recipient: { email: email ?? "", name: patientName },
        fields,
        pdf: pdfBuffer,
        pdfFilename,
        language: "de",
      });

      await supabase
        .from("anamnese_submissions")
        .update({
          status: "signatur_ausstehend",
          documenso_envelope_id: signing.envelopeId,
          documenso_recipient_token: signing.token,
        })
        .eq("id", submissionId);

      // Host fuer die Einbettung (Basis ohne /api/v2), damit der Client weiss,
      // welche Documenso-Instanz das Signier-Fenster laedt.
      const documensoHost = (process.env.DOCUMENSO_BASE_URL ?? "")
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/api\/v2$/, "");

      return NextResponse.json({
        ok: true,
        id: submissionId,
        token: signing.token,
        host: documensoHost,
      });
    } catch (documensoError) {
      // Daten sind gespeichert. Ohne Signier-Link faellt das Frontend auf die
      // Eingangsbestaetigung zurueck, die Praxis kann die Signatur nachholen.
      await supabase
        .from("anamnese_submissions")
        .update({
          status: "fehler",
          fehler_text: `Documenso: ${String(documensoError)}`,
        })
        .eq("id", submissionId);

      return NextResponse.json(
        {
          ok: false,
          id: submissionId,
          error: `Signaturanforderung fehlgeschlagen: ${String(documensoError)}`,
        },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
