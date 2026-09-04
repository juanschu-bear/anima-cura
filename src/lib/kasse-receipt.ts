import { createServerClient } from "@/lib/db/supabase";

export const PRAXIS_STAMMDATEN = {
  name: "Dr. Maria Elena Schubert",
  fach: "FZÄ für Kieferorthopädie",
  strasse: "Nikolaistr. 20 im Oelßner's Hof",
  ort: "04109 Leipzig",
  erfasstVon: "Praxis Schubert, Kasse",
} as const;

const ZAHLART_LABELS: Record<string, string> = {
  qr_ueberweisung: "QR-Überweisung",
  ueberweisung: "Überweisung",
  girocard: "Girocard",
  kreditkarte: "Kreditkarte",
  bar: "Bar",
  guthaben: "Guthaben",
};

export type ReceiptVariant = "praxis" | "patient";
export type ReceiptFormat = "a4" | "a5";

export interface KassenBelegData {
  id: string;
  patient_id: string | null;
  transaktion_id: string | null;
  kassen_datum: string | null;
  betrag: number | string | null;
  buchungstyp: "einnahme" | "ausgabe";
  zahlart: string;
  zweck: string | null;
  notiz: string | null;
  quartal_jahr: number | null;
  quartal_nummer: number | null;
  beleg_nr: string | null;
  created_at: string | null;
  patients?: {
    vorname?: string | null;
    nachname?: string | null;
    ivoris_nummer?: string | null;
  } | null;
}

export function parseReceiptVariant(value?: string | null): ReceiptVariant {
  return value === "patient" ? "patient" : "praxis";
}

export function parseReceiptFormat(value?: string | null): ReceiptFormat {
  return value === "a5" ? "a5" : "a4";
}

export function sanitizeReturnTo(value?: string | null): string | null {
  if (!value) return null;
  return value.startsWith("/") ? value : null;
}

export function getReceiptPaymentLabel(value?: string | null): string {
  if (!value) return "—";
  return ZAHLART_LABELS[value] || value;
}

export function getReceiptPatientName(beleg: KassenBelegData): string {
  if (!beleg.patient_id) return "—";
  const nachname = beleg.patients?.nachname?.trim() || "—";
  const vorname = beleg.patients?.vorname?.trim() || "";
  return `${nachname}${vorname ? `, ${vorname}` : ""}`;
}

export function getReceiptPatientNumber(beleg: KassenBelegData): string {
  if (!beleg.patient_id) return "—";
  return beleg.patients?.ivoris_nummer?.trim() || "—";
}

export function formatReceiptDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatReceiptAmount(value?: number | string | null, buchungstyp?: "einnahme" | "ausgabe"): string {
  const amount = Math.abs(Number(value || 0));
  const sign = buchungstyp === "ausgabe" ? "-" : "";
  return `${sign}${amount.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function formatReceiptQuarter(beleg: KassenBelegData): string {
  if (!beleg.quartal_jahr || !beleg.quartal_nummer) return "–";
  return `Q${beleg.quartal_nummer} ${beleg.quartal_jahr}`;
}

export function isReceiptReceived(beleg: KassenBelegData): boolean {
  if (beleg.buchungstyp === "ausgabe") return true;
  if (["bar", "girocard", "kreditkarte", "guthaben"].includes(beleg.zahlart)) return true;
  return Boolean(beleg.transaktion_id);
}

export function canRenderPatientReceipt(beleg: KassenBelegData): boolean {
  return beleg.buchungstyp !== "ausgabe" && isReceiptReceived(beleg);
}

export function getReceiptDocumentTitle(beleg: KassenBelegData, variant: ReceiptVariant): string {
  if (beleg.buchungstyp === "ausgabe") return "Interner Kassenbeleg";
  if (!isReceiptReceived(beleg)) return "Praxisbeleg";
  return variant === "patient" ? "Zahlungsquittung" : "Praxisquittung";
}

export function getReceiptIntro(beleg: KassenBelegData, variant: ReceiptVariant): string {
  if (beleg.buchungstyp === "ausgabe") {
    return "Interne Dokumentation einer im Kassenbereich der Praxis erfassten Ausgabe. Dieses Dokument ist keine Rechnung.";
  }
  if (!isReceiptReceived(beleg)) {
    return "Vorgemerkte Zahlung aus AnimaPay Kasse. Die Patientenkopie wird erst freigegeben, sobald der echte Geldeingang im Praxiskonto verbucht ist.";
  }
  if (variant === "patient") {
    return "Quittung über eine in der Praxis erfasste Zahlung. Dieses Dokument ist keine Rechnung.";
  }
  return "Quittung über eine im Kassenbereich der Praxis erfasste Zahlung. Dieses Dokument ist keine Rechnung.";
}

export function getReceiptAmountLabel(beleg: KassenBelegData): string {
  if (beleg.buchungstyp === "ausgabe") return "Dokumentierter Betrag";
  return isReceiptReceived(beleg) ? "Erhaltener Betrag" : "Vorgemerkter Betrag";
}

export function getReceiptAmountNote(beleg: KassenBelegData): string {
  const label = getReceiptPaymentLabel(beleg.zahlart);
  const datum = formatReceiptDate(beleg.kassen_datum || beleg.created_at);
  if (beleg.buchungstyp === "ausgabe") {
    return `Ausgabe am ${datum} im Kassenbereich der Praxis dokumentiert.`;
  }
  if (!isReceiptReceived(beleg)) {
    return `${label} am ${datum} in AnimaPay Kasse angelegt. Die Patientenkopie wird nach bestätigtem Geldeingang freigeschaltet.`;
  }
  return `${label} erhalten am ${datum} im Kassenbereich der Praxis.`;
}

export function getReceiptBookingLabel(beleg: KassenBelegData): string {
  if (beleg.buchungstyp === "ausgabe") return "Praxis-Ausgabe";
  if (!isReceiptReceived(beleg)) return "Zahlung angekündigt";
  return "Patientenzahlung";
}

export function getReceiptFilename(beleg: KassenBelegData, variant: ReceiptVariant): string {
  const basis =
    beleg.buchungstyp === "ausgabe"
      ? "Kassenbeleg"
      : variant === "patient"
      ? "Zahlungsquittung"
      : "Praxisquittung";
  const nummer = (beleg.beleg_nr || beleg.id || "Beleg").replace(/[^a-zA-Z0-9-]+/g, "-");
  return `${basis}-${nummer}.pdf`;
}

export function buildReceiptPreviewHref(
  id: string,
  options?: {
    variant?: ReceiptVariant;
    format?: ReceiptFormat;
    returnTo?: string | null;
    autoPrint?: boolean;
    mode?: "preview" | "pdf";
  }
): string {
  const params = new URLSearchParams();
  const variant = options?.variant && options.variant !== "praxis" ? options.variant : null;
  const format = options?.format && options.format !== "a4" ? options.format : null;
  const returnTo = sanitizeReturnTo(options?.returnTo || null);

  if (variant) params.set("variant", variant);
  if (format) params.set("format", format);
  if (returnTo) params.set("returnTo", returnTo);
  if (options?.autoPrint) params.set("autoPrint", "1");
  if (options?.mode === "pdf") params.set("mode", "pdf");

  const query = params.toString();
  return `/kasse/beleg/${id}/print${query ? `?${query}` : ""}`;
}

export function buildReceiptPdfHref(
  id: string,
  options?: {
    variant?: ReceiptVariant;
    format?: ReceiptFormat;
  }
): string {
  const params = new URLSearchParams();
  const variant = options?.variant && options.variant !== "praxis" ? options.variant : null;
  const format = options?.format && options.format !== "a4" ? options.format : null;

  if (variant) params.set("variant", variant);
  if (format) params.set("format", format);

  const query = params.toString();
  return `/api/kasse/beleg/${id}/pdf${query ? `?${query}` : ""}`;
}

export async function loadKassenBeleg(id: string): Promise<KassenBelegData | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("kassen_zahlungen")
    .select(
      "id, patient_id, transaktion_id, kassen_datum, betrag, buchungstyp, zahlart, zweck, notiz, quartal_jahr, quartal_nummer, beleg_nr, created_at, patients:patient_id(vorname, nachname, ivoris_nummer)"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return (data as KassenBelegData | null) ?? null;
}
