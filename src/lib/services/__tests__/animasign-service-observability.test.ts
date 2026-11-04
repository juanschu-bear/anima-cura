import test from "node:test";
import assert from "node:assert/strict";
import { DocumensoError } from "@/lib/documenso/client";
import {
  documensoFailureForStorage,
  sanitizeDocumensoResponse,
} from "@/lib/services/animasign-service-observability";

test("Documenso error bodies retain the technical cause without patient data", () => {
  const safe = documensoFailureForStorage(
    "envelope/create",
    new DocumensoError(
      "envelope/create fehlgeschlagen (400)",
      400,
      JSON.stringify({
        message: "Invalid recipient",
        recipient: { email: "patient@example.com", name: "Max Mustermann" },
        externalId: "d9428888-122b-11e1-b85c-61cd3cbb3210",
      }),
    ),
  );

  assert.match(safe, /envelope\/create: HTTP 400/);
  assert.match(safe, /Invalid recipient/);
  assert.doesNotMatch(safe, /patient@example\.com|Max Mustermann|d9428888/);
});

test("plain Documenso responses redact emails, UUIDs and API tokens", () => {
  const safe = sanitizeDocumensoResponse(
    "patient@example.com d9428888-122b-11e1-b85c-61cd3cbb3210 api_secretvalue",
  );
  assert.equal(safe, "[EMAIL] [UUID] [TOKEN]");
});
