export const MANUAL_REVIEW_PREFIX = "MANUAL_REVIEW:";

export function formatManualReviewError(reason: string) {
  return `${MANUAL_REVIEW_PREFIX} ${reason}`.trim();
}

export function isManualReviewErrorText(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(MANUAL_REVIEW_PREFIX);
}

export function stripManualReviewPrefix(value: string | null | undefined) {
  if (!value) return null;
  return isManualReviewErrorText(value)
    ? value.slice(MANUAL_REVIEW_PREFIX.length).trim()
    : value;
}
