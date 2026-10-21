export function normalizeStaffInitials(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase().replace(/[^A-ZÄÖÜ0-9-]/g, "");
  return normalized || null;
}

export function appendStaffInitials(text: string, value: unknown): string {
  // Das persönliche Kürzel bleibt für die interne, revisionssichere Zuordnung
  // gespeichert. Im IVORIS-Freitext wird es jedoch nicht angehängt.
  void value;
  return text.trimEnd();
}

export const MISSING_STAFF_INITIALS_MESSAGE =
  "Für die eindeutige Dokumentation fehlt deinem persönlichen Mitarbeiterkonto ein Kürzel. Bitte wechsle das Mitarbeiterkonto oder hinterlege das Kürzel in der Teamverwaltung.";
