import type { AppRole } from "./auth";

// ============================================================
// Granulare Rechte (Stufe 2)
// Pro Konto kann der Admin je Modul eine Stufe vergeben:
//   keine | lesen | schreiben
// Ohne expliziten Eintrag gilt der Rollen-Default.
// Stufe A setzt Sichtbarkeit und Seitenzugriff durch (Navigation,
// Direktaufruf); die Schreib-Durchsetzung in den Modul-APIs folgt
// modulweise (Stufe B). Scribe ist bereits API-seitig durchgesetzt
// (permissions.scribe_schreiben).
// ============================================================

export type Stufe = "keine" | "lesen" | "schreiben";
export const STUFEN: Stufe[] = ["keine", "lesen", "schreiben"];

export type ProfilPermissions = {
  scribe_schreiben?: boolean;
  module?: Record<string, string>;
} | null;

export const MODULE: { schluessel: string; pfad: string; label: string }[] = [
  { schluessel: "uebersicht", pfad: "/uebersicht", label: "Übersicht" },
  { schluessel: "finanzen", pfad: "/finanzen", label: "Finanzen" },
  { schluessel: "kasse", pfad: "/kasse", label: "Kasse" },
  { schluessel: "zahlungen", pfad: "/zahlungen", label: "Zahlungen" },
  { schluessel: "offene_posten", pfad: "/offene-posten", label: "Offene Posten" },
  { schluessel: "rechnungen", pfad: "/rechnungen", label: "Rechnungen" },
  { schluessel: "ratenplan", pfad: "/ratenplan", label: "Ratenplan" },
  { schluessel: "mahnwesen", pfad: "/mahnwesen", label: "Mahnwesen" },
  { schluessel: "quartal", pfad: "/quartal", label: "Quartal" },
  { schluessel: "berichte", pfad: "/berichte", label: "Berichte" },
  { schluessel: "intelligence", pfad: "/intelligence", label: "Intelligence" },
  { schluessel: "patienten", pfad: "/patienten", label: "Patienten" },
  { schluessel: "nachrichten", pfad: "/nachrichten", label: "Nachrichten" },
  { schluessel: "automatisierungen", pfad: "/automatisierungen", label: "Automatisierungen" },
  { schluessel: "import", pfad: "/import", label: "Import" },
  { schluessel: "einstellungen", pfad: "/einstellungen", label: "Einstellungen" },
];

const LESEZUGRIFF_LESEN = new Set(["uebersicht", "patienten", "quartal", "berichte"]);

export function rollenDefault(role: AppRole | null | undefined, modul: string): Stufe {
  if (role === "admin") return "schreiben";
  if (role === "verwaltung") return modul === "einstellungen" ? "keine" : "schreiben";
  if (role === "lesezugriff") return LESEZUGRIFF_LESEN.has(modul) ? "lesen" : "keine";
  return "keine"; // patient / unbekannt
}

function istStufe(wert: unknown): wert is Stufe {
  return wert === "keine" || wert === "lesen" || wert === "schreiben";
}

export function effektiveStufe(
  role: AppRole | null | undefined,
  permissions: ProfilPermissions | undefined,
  modul: string
): Stufe {
  const explizit = permissions?.module?.[modul];
  if (istStufe(explizit)) return explizit;
  return rollenDefault(role, modul);
}

export function modulFuerPfad(pathname: string): string | null {
  const treffer = MODULE.find((m) => pathname === m.pfad || pathname.startsWith(`${m.pfad}/`));
  return treffer ? treffer.schluessel : null;
}
