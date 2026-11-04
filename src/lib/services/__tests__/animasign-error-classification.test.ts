import test from "node:test";
import assert from "node:assert/strict";
import { classifyAnimaSignError } from "@/lib/animasign/error-classification";

test("AnimaSign dashboard maps every stored error source to a safe practice message", () => {
  const cases = [
    ["Automatisch als Duplikat geschlossen: Referenzfall 123", "duplicate_closed"],
    ["Signatur abgelehnt: ohne Angabe", "rejected"],
    ["Documenso: envelope/create fehlgeschlagen (502)", "signing_service"],
    ["PDF: PDF-Dienst antwortete mit 500", "pdf_service"],
    ["ANIMASIGN_PDF_URL oder ANIMASIGN_PDF_KEY fehlt", "config"],
    ["Documenso: ANIMASIGN_API_KEY/DOCUMENSO_API_KEY fehlt", "config"],
  ] as const;

  for (const [reason, expectedKind] of cases) {
    const result = classifyAnimaSignError("fehler", reason);
    assert.equal(result?.error_kind, expectedKind);
    assert.ok(result?.error_reason.length);
    assert.doesNotMatch(result?.error_reason ?? "", /123|502|ANIMASIGN|Documenso/);
  }
});

test("AnimaSign dashboard returns no error fields for healthy submissions", () => {
  assert.equal(classifyAnimaSignError("signiert", "historischer Text"), null);
});
