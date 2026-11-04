import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractSignature } from "@signpdf/utils";
import { PDFDocument } from "pdf-lib";
import { signPdfWithP12 } from "@/lib/animasign/x509-signing";

test("pdf-lib placeholder produces an OpenSSL-valid detached X.509 signature", async (context) => {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
  } catch {
    context.skip("OpenSSL ist für den kryptografischen Validierungsnachweis nicht verfügbar");
    return;
  }

  const directory = await mkdtemp(join(tmpdir(), "animasign-x509-"));
  const keyPath = join(directory, "key.pem");
  const certificatePath = join(directory, "certificate.pem");
  const bundlePath = join(directory, "certificate.p12");
  const signaturePath = join(directory, "signature.der");
  const signedDataPath = join(directory, "signed-data.bin");
  const passphrase = "animasign-test";

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
        certificatePath,
        "-days",
        "1",
        "-nodes",
        "-subj",
        "/CN=AnimaSign Test",
      ],
      { stdio: "ignore" },
    );
    execFileSync(
      "openssl",
      [
        "pkcs12",
        "-export",
        "-out",
        bundlePath,
        "-inkey",
        keyPath,
        "-in",
        certificatePath,
        "-passout",
        `pass:${passphrase}`,
      ],
      { stdio: "ignore" },
    );

    const source = await PDFDocument.create();
    source.addPage();
    const signedPdf = await signPdfWithP12({
      pdf: Buffer.from(await source.save()),
      certificate: await readFile(bundlePath),
      passphrase,
      metadata: {
        reason: "Kryptografischer Regressionstest",
        contactInfo: "test@example.invalid",
        name: "AnimaSign Test",
        location: "Leipzig, Deutschland",
      },
    });

    const extracted = extractSignature(signedPdf);
    await writeFile(signaturePath, Buffer.from(extracted.signature, "binary"));
    await writeFile(signedDataPath, extracted.signedData);

    execFileSync(
      "openssl",
      [
        "cms",
        "-verify",
        "-binary",
        "-inform",
        "DER",
        "-in",
        signaturePath,
        "-content",
        signedDataPath,
        "-noverify",
        "-out",
        "/dev/null",
      ],
      { stdio: "ignore" },
    );

    const loaded = await PDFDocument.load(signedPdf);
    assert.equal(loaded.getPageCount(), 1);
    assert.ok(extracted.ByteRange.every((value: number) => value >= 0));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
