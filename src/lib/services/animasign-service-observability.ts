import { createServerClient } from "@/lib/db/supabase";
import { DocumensoError } from "@/lib/documenso/client";

type DbClient = ReturnType<typeof createServerClient>;

const MAX_STORED_RESPONSE_LENGTH = 2_000;
const SENSITIVE_KEY = /(?:email|name|recipient|title|external.?id|token|signing.?url|password|secret|authorization)/i;

function redactObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactObject);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[REDACTED]" : redactObject(nested),
    ]),
  );
}

export function sanitizeDocumensoResponse(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? "");
  let safe = raw;

  try {
    safe = JSON.stringify(redactObject(JSON.parse(raw)));
  } catch {
    safe = raw;
  }

  return safe
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[UUID]")
    .replace(/\b(?:api_|Bearer\s+)[A-Za-z0-9._-]+/gi, "[TOKEN]")
    .replace(/(Anamnesebogen\s+)[^"\n,}]+/gi, "$1[PERSON]")
    .slice(0, MAX_STORED_RESPONSE_LENGTH);
}

export function documensoFailureForStorage(operation: string, error: unknown) {
  if (error instanceof DocumensoError) {
    const status = error.status > 0 ? `HTTP ${error.status}` : "Netzwerkfehler";
    const response = sanitizeDocumensoResponse(error.body || error.message);
    return `${operation}: ${status}${response ? ` — ${response}` : ""}`;
  }

  const response = sanitizeDocumensoResponse(
    error instanceof Error ? error.message : String(error),
  );
  const kind = error instanceof TypeError || /fetch|network|socket|econn|timeout/i.test(response)
    ? "Netzwerkfehler"
    : "Interner Fehler";
  return `${operation}: ${kind}${response ? ` — ${response}` : ""}`;
}

export async function recordDocumensoServiceError(params: {
  operation: string;
  error: unknown;
  db?: DbClient;
}) {
  const isTransportError = params.error instanceof DocumensoError
    || params.error instanceof TypeError
    || /fetch|network|socket|econn|timeout/i.test(
      params.error instanceof Error ? params.error.message : String(params.error),
    );
  if (!isTransportError) return null;

  const db = params.db ?? createServerClient();
  const httpStatus = params.error instanceof DocumensoError && params.error.status > 0
    ? params.error.status
    : null;
  const responseText = documensoFailureForStorage(params.operation, params.error);

  const { error } = await db.from("animasign_service_errors").insert({
    operation: params.operation,
    http_status: httpStatus,
    response_text: responseText,
  });

  if (error) {
    console.error("[ANIMASIGN] Signaturdienstfehler konnte nicht protokolliert werden:", error.message);
  }

  return responseText;
}

function documensoOrigin() {
  const raw = process.env.DOCUMENSO_BASE_URL
    ?? process.env.ANIMASIGN_BASE_URL
    ?? process.env.NEXT_PUBLIC_DOCUMENSO_BASE_URL
    ?? "";
  return raw.trim().replace(/\/+$/, "").replace(/\/api\/v2$/, "");
}

type HealthPayload = {
  status?: unknown;
  checks?: {
    database?: { status?: unknown };
    certificate?: { status?: unknown };
  };
};

export async function checkAndStoreAnimaSignHealth(db = createServerClient()) {
  const origin = documensoOrigin();
  const startedAt = Date.now();
  let httpStatus: number | null = null;
  let serviceStatus: string | null = null;
  let databaseStatus: string | null = null;
  let certificateStatus: string | null = null;
  let detail: string | null = null;

  try {
    if (!origin) throw new Error("Signaturdienst ist nicht konfiguriert");
    const response = await fetch(`${origin}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    httpStatus = response.status;
    const body = await response.text();
    detail = sanitizeDocumensoResponse(body);

    if (body) {
      try {
        const payload = JSON.parse(body) as HealthPayload;
        serviceStatus = typeof payload.status === "string" ? payload.status : null;
        databaseStatus = typeof payload.checks?.database?.status === "string"
          ? payload.checks.database.status
          : null;
        certificateStatus = typeof payload.checks?.certificate?.status === "string"
          ? payload.checks.certificate.status
          : null;
      } catch {
        serviceStatus = null;
      }
    }
  } catch (error) {
    detail = sanitizeDocumensoResponse(error instanceof Error ? error.message : String(error));
  }

  const healthy = httpStatus === 200
    && serviceStatus === "ok"
    && databaseStatus === "ok"
    && certificateStatus === "ok";
  const responseMs = Date.now() - startedAt;

  const { error: insertError } = await db.from("animasign_service_health").insert({
    healthy,
    http_status: httpStatus,
    service_status: serviceStatus,
    database_status: databaseStatus,
    certificate_status: certificateStatus,
    response_ms: responseMs,
    detail,
  });
  if (insertError) throw new Error(`Signaturdienstzustand konnte nicht gespeichert werden: ${insertError.message}`);

  if (!healthy) {
    await recordDocumensoServiceError({
      operation: "health",
      error: new DocumensoError("Signaturdienst nicht gesund", httpStatus ?? 0, detail ?? ""),
      db,
    });
  }

  return {
    healthy,
    checkedAt: new Date().toISOString(),
    httpStatus,
    serviceStatus,
    databaseStatus,
    certificateStatus,
    responseMs,
  };
}
