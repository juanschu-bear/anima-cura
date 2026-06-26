import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServerClient } from "@/lib/db/supabase";
import { downloadSignedPdf } from "@/lib/documenso/client";
import { addIvorisDocument, addIvorisKarteiEintrag } from "@/lib/api/ivoris-doku-client";

export const runtime = "nodejs";
export const maxDuration = 60;

type WebhookRecipient = {
  email?: string;
  signingStatus?: string;
  rejectionReason?: string | null;
};

type WebhookBody = {
  event?: string;
  payload?: {
    id?: number;
    externalId?: string | null;
    status?: string;
    completedAt?: string | null;
    recipients?: WebhookRecipient[];
  };
};

function secretOk(received: string | null): boolean {
  const expected = process.env.DOCUMENSO_WEBHOOK_SECRET;
  // Kein Secret konfiguriert: aus Sicherheitsgruenden ablehnen.
  if (!expected) return false;
  if (!received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const received = request.headers.get("x-documenso-secret");
  if (!secretOk(received)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = (await request.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const event = body.event;
  const payload = body.payload;
  const submissionId = payload?.externalId ?? null;

  // Andere Events bestaetigen wir nur, ohne etwas zu tun.
  if (
    !payload ||
    !submissionId ||
    (event !== "DOCUMENT_COMPLETED" && event !== "DOCUMENT_REJECTED")
  ) {
    return NextResponse.json({ received: true });
  }

  const supabase = createServerClient();

  // Abgelehnt: Status setzen, fertig.
  if (event === "DOCUMENT_REJECTED") {
    const reason =
      payload.recipients?.find((r) => r.signingStatus === "REJECTED")
        ?.rejectionReason ?? "ohne Angabe";
    await supabase
      .from("anamnese_submissions")
      .update({ status: "fehler", fehler_text: `Signatur abgelehnt: ${reason}` })
      .eq("id", submissionId);
    return NextResponse.json({ received: true });
  }

  // DOCUMENT_COMPLETED: versiegeltes PDF holen und ablegen.
  const documentId = payload.id;
  if (typeof documentId !== "number") {
    return NextResponse.json({ error: "Keine Dokument-ID" }, { status: 400 });
  }

  // Idempotenz: schon signiert -> nichts tun.
  const { data: existing } = await supabase
    .from("anamnese_submissions")
    .select("status")
    .eq("id", submissionId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ received: true });
  }
  if (existing.status === "signiert") {
    return NextResponse.json({ received: true });
  }

  try {
    const signedPdf = await downloadSignedPdf(documentId);
    const signedPath = `${submissionId}/Anamnesebogen-signiert.pdf`;

    const { error: uploadError } = await supabase.storage
      .from("anamnese-dokumente")
      .upload(signedPath, signedPdf, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Storage: ${uploadError.message}`);
    }

    await supabase
      .from("anamnese_submissions")
      .update({
        status: "signiert",
        signed_pdf_path: signedPath,
        signiert_am: payload.completedAt ?? new Date().toISOString(),
      })
      .eq("id", submissionId);

    // Signiertes PDF in Ivoris-Karteikarte hochladen
    try {
      const { data: sub } = await supabase
        .from("anamnese_submissions")
        .select("patient_id, nachname")
        .eq("id", submissionId)
        .maybeSingle();

      if (sub?.patient_id) {
        const { data: pat } = await supabase
          .from("patients")
          .select("ivoris_id")
          .eq("id", sub.patient_id)
          .maybeSingle();

        if (pat?.ivoris_id) {
          const today = new Date().toISOString().split("T")[0];
          const pdfBase64 = Buffer.from(signedPdf).toString("base64");

          const docId = await addIvorisDocument({
            patientIvorisId: pat.ivoris_id,
            name: `Anamnesebogen_${sub.nachname || "Patient"}_${today}.pdf`,
            date: today,
            contentBase64: pdfBase64,
          });

          await addIvorisKarteiEintrag({
            patientIvorisId: pat.ivoris_id,
            date: today,
            text: "Anamnesebogen digital signiert und in Akte hinterlegt (AnimaSign)",
          });

          console.log(`[IVORIS] PDF + Karteieintrag fuer ${pat.ivoris_id}, docId=${docId}`);
        }
      }
    } catch (ivorisErr) {
      console.error("[IVORIS] PDF-Upload fehlgeschlagen (nicht-blockierend):", ivorisErr);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    // 500 -> Documenso stellt erneut zu.
    await supabase
      .from("anamnese_submissions")
      .update({ fehler_text: `Webhook-Download: ${String(error)}` })
      .eq("id", submissionId);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
