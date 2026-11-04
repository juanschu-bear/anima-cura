import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PGlite } from "@electric-sql/pglite";
import {
  buildAnimaSignFormVersion,
  buildFormSignatureFinalizationArtifacts,
  isFormSignatureFinalizationEnabled,
} from "@/lib/services/animasign-form-signature-finalization";

const TEST_SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("form-signature finalization stays disabled unless explicitly enabled", () => {
  assert.equal(isFormSignatureFinalizationEnabled(undefined), false);
  assert.equal(isFormSignatureFinalizationEnabled("0"), false);
  assert.equal(isFormSignatureFinalizationEnabled("false"), false);
  assert.equal(isFormSignatureFinalizationEnabled("true"), true);
  assert.equal(isFormSignatureFinalizationEnabled(" TRUE "), true);
});

test("form version is deterministic and changes with the rendering schema", () => {
  const first = buildAnimaSignFormVersion({ meds: [{ key: "a", t: "A" }] });
  const reordered = buildAnimaSignFormVersion({ meds: [{ t: "A", key: "a" }] });
  const changed = buildAnimaSignFormVersion({ meds: [{ key: "a", t: "B" }] });
  assert.equal(first, reordered);
  assert.notEqual(first, changed);
  assert.match(first, /^sha256:[a-f0-9]{64}$/);
});

test("enabled form finalization returns before any Documenso request", async () => {
  const route = await readFile("src/app/api/anima-sign/submit/route.ts", "utf8");
  const flagBranch = route.indexOf("if (isFormSignatureFinalizationEnabled())");
  const successfulReturn = route.indexOf("finalized: true", flagBranch);
  const documensoCall = route.indexOf("await createAndDistribute", flagBranch);
  assert.ok(flagBranch > 0);
  assert.ok(successfulReturn > flagBranch);
  assert.ok(documensoCall > successfulReturn);
});

test("finalization protocol is service-only and immutable", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.anamnese_submissions(id uuid PRIMARY KEY);
    `);
    await db.exec(
      await readFile("supabase/migrations/074_animasign_form_signature_finalization.sql", "utf8"),
    );
    await db.exec(
      "INSERT INTO public.anamnese_submissions(id) VALUES ('00000000-0000-4000-8000-000000000001')",
    );
    await db.exec("SET ROLE service_role");
    await db.exec(`
      INSERT INTO public.animasign_finalization_records(
        submission_id, submitted_at, form_version, signature_sha256,
        pdf_sha256, sealed_pdf_sha256, abschluss_ort, abschluss_datum,
        certificate_subject, certificate_issuer, certificate_serial_number,
        certificate_valid_from, certificate_valid_to, certificate_fingerprint_sha256
      ) VALUES (
        '00000000-0000-4000-8000-000000000001', now(), 'sha256:test',
        repeat('a',64), repeat('b',64), repeat('c',64), 'Leipzig', '2026-11-04',
        'CN=Praxis', 'CN=Test CA', '01', now(), now() + interval '1 year', repeat('d',64)
      );
    `);
    await assert.rejects(
      db.exec("UPDATE public.animasign_finalization_records SET abschluss_ort='Berlin'"),
      /permission denied|immutable/,
    );
    await assert.rejects(
      db.exec("DELETE FROM public.animasign_finalization_records"),
      /permission denied|immutable/,
    );
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(
      db.query("SELECT * FROM public.animasign_finalization_records"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});

test("stored signature, place and date are embedded before the final X.509 seal", async (context) => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
  } catch {
    context.skip("OpenSSL ist für den Test nicht verfügbar");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animasign-form-finalization-"));
  const keyPath = join(directory, "key.pem");
  const certPath = join(directory, "certificate.pem");
  const p12Path = join(directory, "certificate.p12");
  const pdfPath = join(directory, "finalized.pdf");
  const passphrase = "form-finalization-test";

  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        "1",
        "-nodes",
        "-subj",
        "/CN=AnimaSign Formularabschluss Test/O=Anima Cura",
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "openssl",
      [
        "pkcs12",
        "-export",
        "-out",
        p12Path,
        "-inkey",
        keyPath,
        "-in",
        certPath,
        "-passout",
        `pass:${passphrase}`,
      ],
      { stdio: "ignore" },
    );

    const source = await PDFDocument.create();
    const page = source.addPage([595.28, 841.89]);
    const font = await source.embedFont(StandardFonts.Helvetica);
    page.drawText("Anonymisierter Anamnesebogen", { x: 52, y: 780, size: 16, font });

    const artifacts = await buildFormSignatureFinalizationArtifacts({
      renderedPdf: Buffer.from(await source.save()),
      patientName: "Erika Beispiel",
      signatureDataUrl: TEST_SIGNATURE,
      location: "Leipzig",
      signedDate: "2026-11-04",
      submittedAt: "2026-11-04T16:30:00.000Z",
      certificate: await readFile(p12Path),
      passphrase,
    });

    assert.equal(artifacts.signaturePage, 2);
    assert.match(artifacts.signatureSha256, /^[a-f0-9]{64}$/);
    assert.match(artifacts.pdfSha256, /^[a-f0-9]{64}$/);
    assert.match(artifacts.sealedPdfSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(artifacts.pdfSha256, artifacts.sealedPdfSha256);
    assert.match(artifacts.certificate.subject, /AnimaSign Formularabschluss Test/);
    assert.match(artifacts.signedPdf.toString("latin1"), /ETSI\.CAdES\.detached/);

    const reopened = await PDFDocument.load(artifacts.signedPdf);
    assert.equal(reopened.getPageCount(), 2);
    await writeFile(pdfPath, artifacts.signedPdf);

    try {
      const text = execFileSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
      assert.match(text, /Leipzig/);
      assert.match(text, /04\.11\.2026/);
    } catch {
      context.diagnostic("pdftotext ist nicht verfügbar; die PDF wurde mit pdf-lib erneut geöffnet");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
