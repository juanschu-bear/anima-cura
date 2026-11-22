const PATIENT_PORTAL_PATH = "/patient/portal";
const SAFE_ORIGIN = "https://animacura.local";
const DOCUMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_SECTIONS = new Set(["documents", "invoices", "rechnungen"]);

type PortalTargetInput = {
  document?: string | null;
  section?: string | null;
  contactChange?: string | null;
};

export function buildPatientPortalTarget(input: PortalTargetInput = {}) {
  const params = new URLSearchParams();
  if (input.document && DOCUMENT_ID.test(input.document)) params.set("document", input.document);
  if (input.section && ALLOWED_SECTIONS.has(input.section)) params.set("section", input.section);
  if (input.contactChange && DOCUMENT_ID.test(input.contactChange)) params.set("contactChange", input.contactChange);
  const query = params.toString();
  return `${PATIENT_PORTAL_PATH}${query ? `?${query}` : ""}`;
}

export function safePatientTarget(value: string | null | undefined) {
  if (!value || value.startsWith("//")) return PATIENT_PORTAL_PATH;
  try {
    const parsed = new URL(value, SAFE_ORIGIN);
    if (parsed.origin !== SAFE_ORIGIN || parsed.pathname !== PATIENT_PORTAL_PATH) return PATIENT_PORTAL_PATH;
    return buildPatientPortalTarget({
      document: parsed.searchParams.get("document"),
      section: parsed.searchParams.get("section"),
      contactChange: parsed.searchParams.get("contactChange"),
    });
  } catch {
    return PATIENT_PORTAL_PATH;
  }
}
