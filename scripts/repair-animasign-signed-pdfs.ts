import { createServerClient } from "@/lib/db/supabase";
import { rebuildLegacySignedPdf } from "@/lib/animasign/pdf-layout";

type SubmissionRow = {
  id: string;
  created_at: string;
  signiert_am: string | null;
  vorname: string | null;
  nachname: string | null;
  signed_pdf_path: string | null;
};

function parseArgs() {
  const from = process.argv.find((arg) => arg.startsWith("--from="))?.split("=")[1] ?? "2026-08-11T00:00:00Z";
  const to = process.argv.find((arg) => arg.startsWith("--to="))?.split("=")[1] ?? new Date().toISOString();
  const apply = process.argv.includes("--apply");
  return { from, to, apply };
}

async function main() {
  const { from, to, apply } = parseArgs();
  const db = createServerClient();

  const { data: rows, error } = await db
    .from("anamnese_submissions")
    .select("id, created_at, signiert_am, vorname, nachname, signed_pdf_path")
    .eq("status", "signiert")
    .not("signed_pdf_path", "is", null)
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Submissions konnten nicht geladen werden: ${error.message}`);

  const submissions = (rows ?? []) as SubmissionRow[];
  const results: Array<Record<string, unknown>> = [];

  for (const submission of submissions) {
    const unsignedPath = `${submission.id}/Anamnesebogen.pdf`;
    const signedPath = submission.signed_pdf_path;
    if (!signedPath) continue;

    const [unsignedDownload, signedDownload] = await Promise.all([
      db.storage.from("anamnese-dokumente").download(unsignedPath),
      db.storage.from("anamnese-dokumente").download(signedPath),
    ]);

    if (unsignedDownload.error || !unsignedDownload.data) {
      results.push({
        id: submission.id,
        name: `${submission.vorname ?? ""} ${submission.nachname ?? ""}`.trim(),
        status: "error",
        detail: `unsigned download failed: ${unsignedDownload.error?.message ?? "missing data"}`,
      });
      continue;
    }

    if (signedDownload.error || !signedDownload.data) {
      results.push({
        id: submission.id,
        name: `${submission.vorname ?? ""} ${submission.nachname ?? ""}`.trim(),
        status: "error",
        detail: `signed download failed: ${signedDownload.error?.message ?? "missing data"}`,
      });
      continue;
    }

    const repaired = await rebuildLegacySignedPdf({
      unsignedPdf: Buffer.from(await unsignedDownload.data.arrayBuffer()),
      legacySignedPdf: Buffer.from(await signedDownload.data.arrayBuffer()),
      patientName: [submission.vorname, submission.nachname].filter(Boolean).join(" ").trim() || "Patient",
      signedAt: submission.signiert_am,
    });

    if (apply) {
      const { error: uploadError } = await db.storage
        .from("anamnese-dokumente")
        .upload(signedPath, repaired, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        results.push({
          id: submission.id,
          name: `${submission.vorname ?? ""} ${submission.nachname ?? ""}`.trim(),
          status: "error",
          detail: `upload failed: ${uploadError.message}`,
        });
        continue;
      }
    }

    results.push({
      id: submission.id,
      name: `${submission.vorname ?? ""} ${submission.nachname ?? ""}`.trim(),
      status: apply ? "repaired" : "dry-run",
      output: signedPath,
      bytes: repaired.byteLength,
    });
  }

  console.log(JSON.stringify({
    from,
    to,
    apply,
    total: submissions.length,
    results,
  }, null, 2));
}

void main().catch((error) => {
  console.error("[repair-animasign-signed-pdfs]", error);
  process.exit(1);
});
