import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { appendReservedSignaturePage } from "@/lib/animasign/pdf-layout";
import { parseDocumensoRequestTimeoutMs } from "@/lib/documenso/client";
import { settleAlreadyPushedScribeOutboxClaims } from "@/lib/services/scribe-ivoris-retry";
import {
  isMissingRefreshTokenError,
  isProtectedScribePath,
  isScribePath,
} from "@/lib/auth-refresh-recovery";

test("prepared AnimaSign PDFs accept the official pdf-lib placeholder", async () => {
  const input = await PDFDocument.create();
  input.addPage();
  const prepared = await appendReservedSignaturePage(
    Buffer.from(await input.save()),
    "Test",
  );

  const preparedDoc = await PDFDocument.load(prepared.pdfBuffer);
  pdflibAddPlaceholder({
    pdfDoc: preparedDoc,
    reason: "Regression test",
    contactInfo: "test@example.invalid",
    name: "AnimaSign Test",
    location: "Test",
  });
  const placeholderPdf = await preparedDoc.save();

  assert.ok(placeholderPdf.byteLength > prepared.pdfBuffer.byteLength);
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

test("already pushed Scribe claims are closed instead of remaining in processing", async () => {
  const updates: Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];
  const db = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const call = { table, patch, filters: [] as Array<[string, unknown]> };
          updates.push(call);
          const chain = {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return chain;
            },
            then(resolve: (value: { error: null }) => unknown) {
              return Promise.resolve(resolve({ error: null }));
            },
          };
          return chain;
        },
      };
    },
  };

  const settled = await settleAlreadyPushedScribeOutboxClaims(
    db as never,
    [
      {
        id: "already-pushed",
        termin_datum: "2026-11-04",
        version: 1,
        text: null,
        zaehne: null,
        bestaetigt_kuerzel: null,
        ivoris_push_status: "gepusht",
        ivoris_fehler: null,
        ivoris_retry_count: 0,
        ivoris_next_retry_at: null,
        ivoris_gepusht_am: "2026-11-04T10:00:00.000Z",
        patients: null,
      },
      {
        id: "still-pending",
        termin_datum: "2026-11-04",
        version: 1,
        text: null,
        zaehne: null,
        bestaetigt_kuerzel: null,
        ivoris_push_status: "ausstehend",
        ivoris_fehler: null,
        ivoris_retry_count: 0,
        ivoris_next_retry_at: null,
        ivoris_gepusht_am: null,
        patients: null,
      },
    ],
    "scribe-test-worker",
  );

  assert.equal(settled, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].table, "integration_outbox_jobs");
  assert.equal(updates[0].patch.status, "succeeded");
  assert.equal(updates[0].patch.succeeded_at, "2026-11-04T10:00:00.000Z");
  assert.deepEqual(updates[0].filters, [
    ["artifact_type", "carteitext"],
    ["artifact_id", "already-pushed"],
    ["status", "processing"],
    ["locked_by", "scribe-test-worker"],
  ]);
});
