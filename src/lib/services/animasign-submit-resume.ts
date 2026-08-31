export type RecentIdentityReplayCandidate = {
  status: string | null;
  documenso_recipient_token?: string | null;
  signed_pdf_path?: string | null;
};

export function classifyRecentIdentitySubmission(
  submission: RecentIdentityReplayCandidate
): "replay" | "resume" | "ignore" {
  if (submission.signed_pdf_path) {
    return "ignore";
  }

  if (
    submission.status === "signatur_ausstehend" &&
    submission.documenso_recipient_token
  ) {
    return "replay";
  }

  if (
    !submission.documenso_recipient_token &&
    (submission.status === "fehler" ||
      submission.status === "offen" ||
      submission.status === "signiert")
  ) {
    return "resume";
  }

  return "ignore";
}
