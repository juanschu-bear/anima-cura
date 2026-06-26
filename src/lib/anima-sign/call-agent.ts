export function getCallAgentTokenFromRequest(request: Request): string | null {
  const apiToken = request.headers.get("x-api-token")?.trim();
  if (apiToken) return apiToken;

  const authHeader = request.headers.get("authorization")?.trim();
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function isCallAgentAuthorized(request: Request): boolean {
  const expected = process.env.CALL_AGENT_TOKEN?.trim();
  const received = getCallAgentTokenFromRequest(request);
  return Boolean(expected && received && expected === received);
}

export function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function normalizeCallLanguage(value: unknown): "de" | "en" | "es" {
  const locale = asNonEmptyString(value)?.toLowerCase();
  if (locale?.startsWith("en")) return "en";
  if (locale?.startsWith("es")) return "es";
  return "de";
}

export function extractCallPhone(answers: Record<string, unknown> | null | undefined): string | null {
  if (!answers || typeof answers !== "object") return null;

  return (
    asNonEmptyString(answers["patient_mobil"]) ||
    asNonEmptyString(answers["patient_telefon"]) ||
    asNonEmptyString(answers["vp_telefon"]) ||
    asNonEmptyString(answers["zahler_telefon"]) ||
    null
  );
}
