import { timingSafeEqual } from "node:crypto";
import signpdf from "@signpdf/signpdf";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";
import { P12Signer } from "@signpdf/signer-p12";
import { PDFDocument } from "pdf-lib";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import {
  createAndDistribute,
  getEnvelope,
  type DocumensoField,
} from "@/lib/documenso/client";

export const runtime = "nodejs";
export const maxDuration = 60;

const TARGETS = {
  "14:07": ["2026-11-03T13:07:00Z", "2026-11-03T13:08:00Z"],
  "15:14": ["2026-11-03T14:14:00Z", "2026-11-03T14:15:00Z"],
  "16:59": ["2026-11-03T15:59:00Z", "2026-11-03T16:00:00Z"],
} as const;

type TargetLabel = keyof typeof TARGETS;

function authorized(request: NextRequest) {
  const expected = process.env.ANIMASIGN_RECOVERY_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

function targetFromBody(value: unknown): TargetLabel | null {
  if (!value || typeof value !== "object") return null;
  const target = (value as { target?: unknown }).target;
  return typeof target === "string" && target in TARGETS ? target as TargetLabel : null;
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const target = targetFromBody(await request.json().catch(() => null));
  if (!target) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  const [from, to] = TARGETS[target];
  const db = createServerClient();
  const { data, error } = await db
    .from("anamnese_submissions")
    .select("id, status, signed_pdf_path, signiert_am, documenso_envelope_id, documenso_recipient_token, email, vorname, nachname, answers")
    .gte("created_at", from)
    .lt("created_at", to)
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
  if (data?.length !== 1) {
    return NextResponse.json({ error: "target_not_unique", count: data?.length ?? 0 }, { status: 409 });
  }

  const row = data[0];
  if (row.signed_pdf_path || row.signiert_am) {
    return NextResponse.json({
      target,
      finalSignedPdf: Boolean(row.signed_pdf_path),
      signedAt: row.signiert_am,
      envelope: Boolean(row.documenso_envelope_id),
      patientMessageSent: false,
      alreadyCompleted: true,
    });
  }

  if (row.documenso_envelope_id) {
    const envelope = await getEnvelope(row.documenso_envelope_id);
    return NextResponse.json({
      target,
      finalSignedPdf: false,
      signedAt: null,
      envelope: true,
      envelopeStatus: envelope.status,
      patientMessageSent: false,
      requiresPatientSignature: envelope.status !== "COMPLETED",
      alreadyRequested: true,
    });
  }

  const storedSignature = typeof row.answers?.unterschrift_versicherter === "string"
    && row.answers.unterschrift_versicherter.startsWith("data:image/");
  if (row.status !== "fehler" || !storedSignature || !row.email) {
    return NextResponse.json({ error: "unsafe_existing_state" }, { status: 409 });
  }

  const unsignedPath = `${row.id}/Anamnesebogen.pdf`;
  const { data: storedPdf, error: downloadError } = await db.storage
    .from("anamnese-dokumente")
    .download(unsignedPath);
  if (downloadError || !storedPdf) {
    return NextResponse.json({ error: "draft_download_failed" }, { status: 502 });
  }

  const doc = await PDFDocument.load(Buffer.from(await storedPdf.arrayBuffer()));
  const signaturePage = doc.getPageCount();
  const classicPdf = Buffer.from(await doc.save({ useObjectStreams: false }));
  const certBase64 = process.env.PDF_SIGNING_CERT;
  const certPass = process.env.PDF_SIGNING_PASSPHRASE;
  if (!certBase64 || !certPass) {
    return NextResponse.json({ error: "pdf_certificate_missing" }, { status: 503 });
  }

  const placeholderPdf = plainAddPlaceholder({
    pdfBuffer: classicPdf,
    reason: "Anamnesebogen digital signiert",
    contactInfo: "praxis@praxis-schubert.de",
    name: "AnimaSign / KFO-Praxis Dr. Maria Elena Schubert",
    location: "Leipzig, Deutschland",
  });
  const signer = new P12Signer(Buffer.from(certBase64, "base64"), { passphrase: certPass });
  const technicallySignedPdf = Buffer.from(await signpdf.sign(placeholderPdf, signer));
  const fields: DocumensoField[] = [
    { type: "SIGNATURE", page: signaturePage, positionX: 8, positionY: 64, width: 84, height: 12 },
    { type: "DATE", page: signaturePage, positionX: 58, positionY: 77, width: 24, height: 5 },
  ];
  const patientName = [row.vorname, row.nachname].filter(Boolean).join(" ").trim() || "Patient";

  const signing = await createAndDistribute({
    title: `Anamnesebogen ${patientName}`,
    externalId: row.id,
    recipient: { email: row.email, name: patientName },
    fields,
    pdf: technicallySignedPdf,
    pdfFilename: "Anamnesebogen.pdf",
    language: "de",
  }, {
    redirectUrl: `https://animacura.io/welcome/${row.id}`,
  });

  const { error: uploadError } = await db.storage
    .from("anamnese-dokumente")
    .upload(unsignedPath, technicallySignedPdf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (uploadError) {
    return NextResponse.json({ error: "draft_upload_failed" }, { status: 502 });
  }

  const { data: updated, error: updateError } = await db
    .from("anamnese_submissions")
    .update({
      status: "signatur_ausstehend",
      documenso_envelope_id: signing.envelopeId,
      documenso_recipient_token: signing.token,
      signed_pdf_path: null,
      signiert_am: null,
      fehler_text: null,
    })
    .eq("id", row.id)
    .eq("status", "fehler")
    .is("signed_pdf_path", null)
    .is("signiert_am", null)
    .is("documenso_envelope_id", null)
    .select("signed_pdf_path, signiert_am, documenso_envelope_id")
    .maybeSingle();
  if (updateError || !updated) {
    return NextResponse.json({ error: "submission_update_failed" }, { status: 409 });
  }

  const envelope = await getEnvelope(signing.envelopeId);
  return NextResponse.json({
    target,
    finalSignedPdf: Boolean(updated.signed_pdf_path),
    signedAt: updated.signiert_am,
    envelope: Boolean(updated.documenso_envelope_id),
    envelopeStatus: envelope.status,
    patientMessageSent: false,
    requiresPatientSignature: envelope.status !== "COMPLETED",
  });
}
