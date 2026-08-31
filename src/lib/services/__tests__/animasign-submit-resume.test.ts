import assert from "node:assert/strict";
import test from "node:test";
import { classifyRecentIdentitySubmission } from "../animasign-submit-resume";

test("replays recent submission when signing is still pending and token exists", () => {
  assert.equal(
    classifyRecentIdentitySubmission({
      status: "signatur_ausstehend",
      documenso_recipient_token: "token-123",
      signed_pdf_path: null,
    }),
    "replay"
  );
});

test("resumes failed pre-signature submission without creating a new row", () => {
  assert.equal(
    classifyRecentIdentitySubmission({
      status: "fehler",
      documenso_recipient_token: null,
      signed_pdf_path: null,
    }),
    "resume"
  );
});

test("ignores already signed submissions even when status text still exists", () => {
  assert.equal(
    classifyRecentIdentitySubmission({
      status: "signiert",
      documenso_recipient_token: "token-123",
      signed_pdf_path: "submission-1/Anamnesebogen-signiert.pdf",
    }),
    "ignore"
  );
});
