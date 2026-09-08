export type ScribeIvorisErrorClass =
  | "automatic_retry"
  | "patient_manual_review"
  | "unknown_manual_review";

export function classifyScribeIvorisError(
  error: string | null | undefined
): ScribeIvorisErrorClass {
  const text = (error ?? "").trim();

  if (
    /patient.+could not be found/i.test(text) ||
    /patientid ungueltig/i.test(text) ||
    /patienten-id ungueltig/i.test(text)
  ) {
    return "patient_manual_review";
  }

  if (
    !text ||
    text === "Patient hat keine ivoris_id" ||
    /\(5\d\d\)/.test(text) ||
    /fehlgeschlagen \(5\d\d\)/i.test(text) ||
    /fetch failed|network|timeout|timed out|econn|socket/i.test(text) ||
    /nicht stabil erreichbar/i.test(text) ||
    /doku-konfiguration unvollstaendig/i.test(text)
  ) {
    return "automatic_retry";
  }

  return "unknown_manual_review";
}

export function isAutomaticScribeIvorisRetry(error: string | null | undefined) {
  return classifyScribeIvorisError(error) === "automatic_retry";
}

export function isIvorisServiceOutage(error: string | null | undefined) {
  const text = (error ?? "").trim();
  return /\((502|503|504)\)/.test(text) ||
    /fetch failed|network|timeout|timed out|econnreset|econnrefused|socket hang up/i.test(text);
}

const RETRY_BACKOFF_MINUTES = [5, 30, 120, 720, 2880] as const;

export function buildScribeRetryFailurePatch(
  error: string,
  previousRetryCount: number | null | undefined
) {
  const retryCount = Math.max(0, Number(previousRetryCount ?? 0)) + 1;
  const errorClass = classifyScribeIvorisError(error);
  const minutes = RETRY_BACKOFF_MINUTES[
    Math.min(retryCount - 1, RETRY_BACKOFF_MINUTES.length - 1)
  ];

  return {
    ivoris_push_status: "fehler",
    ivoris_fehler: error,
    ivoris_retry_count: retryCount,
    ivoris_last_attempt_at: new Date().toISOString(),
    ivoris_next_retry_at:
      errorClass === "automatic_retry"
        ? new Date(Date.now() + minutes * 60_000).toISOString()
        : null,
    ivoris_error_class: errorClass,
  };
}
