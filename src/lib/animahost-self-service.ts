/** Kleine, prüfbare Helfer für die Selbstservice-Seiten (Rechnungsempfänger, Kontaktdaten, Bescheinigung). */
export const RECIPIENT_CODE = /^[A-Za-z0-9_-]{43}$/;
export const CERTIFICATE_CODE = /^[A-Za-z0-9_-]{32}$/;
export const CHANGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Liest `code` aus dem Teil hinter dem #. Der Code steht nie in der Adresse, die an den Server geht. */
export function codeFromHash(hash: string, pattern: RegExp): string {
  const raw = new URLSearchParams(hash.replace(/^#/, "")).get("code") ?? "";
  return pattern.test(raw) ? raw : "";
}

/** 2026-11-18 → 18.11.2026; alles andere bleibt, wie es ist. */
export function germanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

// Schlüssel sind die Spalten der Patientenakte, so wie animahost_contact_changes.proposed sie speichert.
const LABELS: Record<string, string> = { email: "selfService.field.email", telefon: "selfService.field.phone", strasse: "selfService.field.street", plz: "selfService.field.postalCode", ort: "selfService.field.city" };
/** Zeigt nur bekannte Textfelder eines Vorschlags, in fester Reihenfolge. */
export function proposedRows(proposed: unknown): { key: string; label: string; value: string }[] {
  if (!proposed || typeof proposed !== "object") return [];
  const p = proposed as Record<string, unknown>;
  return Object.keys(LABELS).flatMap((key) => (typeof p[key] === "string" && (p[key] as string).trim() ? [{ key, label: LABELS[key], value: (p[key] as string).trim() }] : []));
}
