import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";
import { appendReservedSignaturePage } from "@/lib/animasign/pdf-layout";
import { parseDocumensoRequestTimeoutMs } from "@/lib/documenso/client";
import {
  isMissingRefreshTokenError,
  isProtectedScribePath,
  isScribePath,
} from "@/lib/auth-refresh-recovery";

test("prepared AnimaSign PDFs use a classic xref table accepted by signpdf", async () => {
  const input = await PDFDocument.create();
  input.addPage();
  const prepared = await appendReservedSignaturePage(
    Buffer.from(await input.save()),
    "Test",
  );

  const placeholderPdf = plainAddPlaceholder({
    pdfBuffer: prepared.pdfBuffer,
    reason: "Regression test",
  });

  assert.ok(placeholderPdf.byteLength > prepared.pdfBuffer.byteLength);
  assert.match(prepared.pdfBuffer.toString("latin1"), /\nxref\n/);
});

test("Documenso requests have a bounded production-safe timeout", () => {
  assert.equal(parseDocumensoRequestTimeoutMs(undefined), 15_000);
  assert.equal(parseDocumensoRequestTimeoutMs("invalid"), 15_000);
  assert.equal(parseDocumensoRequestTimeoutMs("50"), 1_000);
  assert.equal(parseDocumensoRequestTimeoutMs("120000"), 60_000);
  assert.equal(parseDocumensoRequestTimeoutMs("12000"), 12_000);
});

test("missing refresh tokens redirect protected Scribe routes but not the login route", async () => {
  assert.equal(isMissingRefreshTokenError({ code: "refresh_token_not_found" }), true);
  assert.equal(isMissingRefreshTokenError({ code: "other" }), false);
  assert.equal(isScribePath("/scribe"), true);
  assert.equal(isScribePath("/scribe/animus"), true);
  assert.equal(isScribePath("/scribes"), false);
  assert.equal(isProtectedScribePath("/scribe"), true);
  assert.equal(isProtectedScribePath("/scribe/animus"), true);
  assert.equal(isProtectedScribePath("/scribe/login"), false);

  const middleware = await readFile("middleware.ts", "utf8");
  assert.match(middleware, /"\/scribe\/:path\*"/);
  assert.match(middleware, /isProtectedScribePath\(pathname\)/);
  assert.match(middleware, /new URL\("\/scribe\/login", request\.url\)/);
});

test("IVORIS cron is staged, bounded and rotates signature reconciliation", async () => {
  const route = await readFile("src/app/api/cron/ivoris-sync/route.ts", "utf8");
  assert.match(route, /maxDuration = 300/);
  assert.match(route, /SIGNATURE_BATCH_SIZE = 2/);
  assert.match(route, /SCRIBE_BATCH_SIZE = 2/);

  const reconciliation = await readFile(
    "src/lib/services/animasign-signature-reconciliation.ts",
    "utf8",
  );
  assert.match(reconciliation, /\.order\("updated_at", \{ ascending: true \}\)/);
  assert.match(reconciliation, /markSignatureReconciliationChecked\(db, submission\.id\)/);
});
