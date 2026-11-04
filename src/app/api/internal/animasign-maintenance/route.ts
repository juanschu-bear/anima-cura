import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createServerClient } from "@/lib/db/supabase";
import { createEnvelope, getEnvelope, type DocumensoField } from "@/lib/documenso/client";
import { signPdfWithP12 } from "@/lib/animasign/x509-signing";
import { classifyAnimaSignError } from "@/lib/animasign/error-classification";
import { reconcilePendingAnimaSignSignatures } from "@/lib/services/animasign-signature-reconciliation";

export const runtime = "nodejs";
export const maxDuration = 300;

const AUTH_HASH = "dfba2a8feeb4ca988321eee24d01b4a55308d88ea150f7ee1aed4c790da6dc7b";

function authorized(request: NextRequest) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const actual = createHash("sha256").update(supplied).digest();
  const expected = Buffer.from(AUTH_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function config() {
  const rawBase = process.env.DOCUMENSO_BASE_URL ?? "";
  const apiKey = process.env.ANIMASIGN_API_KEY ?? process.env.DOCUMENSO_API_KEY ?? "";
  const emailRaw = process.env.ANIMASIGN_EMAIL_FROM ?? "";
  const email = emailRaw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const origin = rawBase.trim().replace(/\/+$/, "").replace(/\/api\/v2$/, "");
  if (!origin || !apiKey || !email) throw new Error("maintenance configuration missing");
  return { apiBase: `${origin}/api/v2`, apiKey, email };
}

async function makePdf(label: string) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(label, { x: 50, y: 780, size: 14, font });
  return Buffer.from(await doc.save());
}

async function deleteEnvelope(envelopeId: string) {
  const { apiBase, apiKey } = config();
  const response = await fetch(`${apiBase}/envelope/delete`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ envelopeId }),
  });
  if (!response.ok) throw new Error(`draft cleanup failed (${response.status})`);
}

async function runDraftTests() {
  const { email } = config();
  const certificate = process.env.PDF_SIGNING_CERT;
  const passphrase = process.env.PDF_SIGNING_PASSPHRASE;
  if (!certificate || !passphrase) throw new Error("X.509 configuration missing");

  const unsigned = await makePdf("AnimaSign infrastructure test - unsigned");
  const signed = await signPdfWithP12({
    pdf: await makePdf("AnimaSign infrastructure test - X.509"),
    certificate: Buffer.from(certificate, "base64"),
    passphrase,
    metadata: {
      reason: "AnimaSign Infrastrukturtest",
      contactInfo: email,
      name: "AnimaSign / KFO-Praxis",
      location: "Leipzig, Deutschland",
    },
  });
  const fields: DocumensoField[] = [
    { type: "SIGNATURE", page: 1, positionX: 10, positionY: 70, width: 35, height: 10 },
  ];
  const created: Array<{ kind: "unsigned" | "x509"; id: string }> = [];
  const results: Array<{ kind: string; created: boolean; status: string; deleted: boolean }> = [];

  try {
    for (const [kind, pdf] of [["unsigned", unsigned], ["x509", signed]] as const) {
      const draft = await createEnvelope({
        title: `AnimaSign Infrastrukturtest ${kind}`,
        externalId: `infra-${randomUUID()}`,
        recipient: { email, name: "KFO-Praxis" },
        fields,
        pdf,
        pdfFilename: "infrastrukturtest.pdf",
        language: "de",
      });
      created.push({ kind, id: draft.envelopeId });
      const envelope = await getEnvelope(draft.envelopeId);
      results.push({ kind, created: true, status: envelope.status, deleted: false });
    }
  } finally {
    for (const draft of created.reverse()) {
      await deleteEnvelope(draft.id);
      const result = results.find((entry) => entry.kind === draft.kind);
      if (result) result.deleted = true;
    }
  }

  return results;
}

function identityKey(row: { vorname: string | null; nachname: string | null; geburtsdatum: string | null }) {
  const normalize = (value: string | null) => (value ?? "")
    .trim()
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return `${normalize(row.vorname)}|${normalize(row.nachname)}|${row.geburtsdatum ?? ""}`;
}

async function auditState() {
  const db = createServerClient();
  const [{ data: submissions, error: submissionError }, { data: jobs, error: jobError }] = await Promise.all([
    db.from("anamnese_submissions")
      .select("created_at,status,fehler_text,vorname,nachname,geburtsdatum,signed_pdf_path,signiert_am,documenso_envelope_id")
      .limit(10_000),
    db.from("integration_outbox_jobs")
      .select("artifact_type,status,attempt_count,next_attempt_at,locked_at,created_at,updated_at")
      .neq("status", "succeeded")
      .limit(10_000),
  ]);
  if (submissionError) throw new Error(submissionError.message);
  if (jobError) throw new Error(jobError.message);

  const all = submissions ?? [];
  const successesByIdentity = new Map<string, number[]>();
  for (const row of all) {
    if (!row.signed_pdf_path || !row.signiert_am) continue;
    const key = identityKey(row);
    const values = successesByIdentity.get(key) ?? [];
    values.push(new Date(row.created_at).getTime());
    successesByIdentity.set(key, values);
  }
  const signingFailures = all.filter((row) =>
    classifyAnimaSignError(row.status, row.fehler_text)?.error_kind === "signing_service"
  );
  const laterSuccess = signingFailures.filter((row) =>
    (successesByIdentity.get(identityKey(row)) ?? []).some(
      (createdAt) => createdAt > new Date(row.created_at).getTime(),
    )
  ).length;

  const now = Date.now();
  const openJobs = jobs ?? [];
  const oldest = openJobs
    .map((job) => new Date(job.created_at).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)[0] ?? null;

  return {
    signingFailures: {
      total: signingFailures.length,
      withLaterSuccess: laterSuccess,
      withoutLaterSuccess: signingFailures.length - laterSuccess,
      withEnvelope: signingFailures.filter((row) => Boolean(row.documenso_envelope_id)).length,
      withoutEnvelope: signingFailures.filter((row) => !row.documenso_envelope_id).length,
    },
    outbox: {
      total: openJobs.length,
      queued: openJobs.filter((job) => job.status === "queued").length,
      retryWait: openJobs.filter((job) => job.status === "retry_wait").length,
      manualReview: openJobs.filter((job) => job.status === "manual_review").length,
      processing: openJobs.filter((job) => job.status === "processing").length,
      staleProcessing: openJobs.filter((job) =>
        job.status === "processing"
        && job.locked_at
        && now - new Date(job.locked_at).getTime() > 15 * 60_000
      ).length,
      retryDue: openJobs.filter((job) =>
        job.status === "retry_wait" && job.next_attempt_at && new Date(job.next_attempt_at).getTime() <= now
      ).length,
      oldestAgeDays: oldest ? Math.floor((now - oldest) / 86_400_000) : null,
      byArtifact: Object.fromEntries(
        Array.from(new Set(openJobs.map((job) => job.artifact_type))).map((artifact) => [
          artifact,
          openJobs.filter((job) => job.artifact_type === artifact).length,
        ]),
      ),
    },
  };
}

async function reconcileAll() {
  const db = createServerClient();
  const { count: before, error } = await db
    .from("anamnese_submissions")
    .select("*", { count: "exact", head: true })
    .eq("status", "signatur_ausstehend")
    .is("signed_pdf_path", null)
    .not("documenso_envelope_id", "is", null);
  if (error) throw new Error(error.message);

  const results = await reconcilePendingAnimaSignSignatures({ db, limit: 100, minAgeSeconds: 0 });
  const aggregate = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
  const { count: after, error: afterError } = await db
    .from("anamnese_submissions")
    .select("*", { count: "exact", head: true })
    .eq("status", "signatur_ausstehend")
    .is("signed_pdf_path", null)
    .not("documenso_envelope_id", "is", null);
  if (afterError) throw new Error(afterError.message);
  return { before: before ?? 0, checked: results.length, aggregate, after: after ?? 0 };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const action = (await request.json().catch(() => null))?.action;
  if (action === "draft-tests") return NextResponse.json({ ok: true, results: await runDraftTests() });
  if (action === "reconcile") return NextResponse.json({ ok: true, result: await reconcileAll() });
  if (action === "audit") return NextResponse.json({ ok: true, result: await auditState() });
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
