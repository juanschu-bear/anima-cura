/** A saved draft or system certificate is not evidence of patient signing. */
export function hasCompletedPatientSignature(record: {
  status?: string | null;
  signiert_am?: string | null;
  signed_pdf_path?: string | null;
}): boolean {
  return (
    (record.status === "signiert" || record.status === "an_ivoris_uebertragen") &&
    !!record.signed_pdf_path?.trim() &&
    !!record.signiert_am &&
    Number.isFinite(Date.parse(record.signiert_am))
  );
}
