// AnimaPay - GiroCode (EPC QR) Generator
// Standard: EPC069-12 by European Payments Council

export interface GiroCodeData {
  empfaenger: string;  // Max 70 chars
  iban: string;
  bic?: string;
  betrag: number;      // In EUR, max 999999999.99
  verwendungszweck: string; // Max 140 chars
}

/**
 * Generates an EPC QR Code data string (GiroCode/SEPA QR)
 * Format: BCD\n002\n1\nSCT\n[BIC]\n[Name]\n[IBAN]\nEUR[Amount]\n\n[Reference]\n\n
 */
export function generateGiroCodeString(data: GiroCodeData): string {
  const lines = [
    "BCD",                          // Service Tag
    "002",                          // Version
    "1",                            // Encoding (1=UTF-8)
    "SCT",                          // SEPA Credit Transfer
    data.bic || "",                 // BIC (optional since 2016)
    data.empfaenger.slice(0, 70),   // Beneficiary name
    data.iban.replace(/\s/g, ""),   // IBAN
    `EUR${data.betrag.toFixed(2)}`, // Amount
    "",                             // Purpose code (empty)
    data.verwendungszweck.slice(0, 140), // Reference
    "",                             // Display text (empty)
  ];
  return lines.join("\n");
}

/**
 * Generates a unique Verwendungszweck for a patient rate
 */
export function generateVerwendungszweck(
  patientKuerzel: string,
  rateNummer: number,
  prefix: string = "AC"
): string {
  return `${prefix}-${patientKuerzel}-R${String(rateNummer).padStart(2, "0")}`;
}

/**
 * Default practice bank details (configurable)
 */
export const defaultPraxisBank: Omit<GiroCodeData, "betrag" | "verwendungszweck"> = {
  empfaenger: "Praxis Dr. Maria Schubert",
  iban: "DE89 3704 0044 0532 0130 00", // Demo IBAN
  bic: "COBADEFFXXX",
};
