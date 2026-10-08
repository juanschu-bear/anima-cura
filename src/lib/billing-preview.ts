import { z } from "zod";
import { billingDate } from "./billing-foundation";

const amount = z.number().finite().nonnegative().max(100_000_000);
const previewSchema = z.object({
  patient: z.object({ id: z.string().uuid(), name: z.string().min(1).max(500) }),
  patientArt: z.enum(["privat", "kasse", "mkv"]),
  positionen: z.array(z.object({
    goz_nr: z.string().min(1).max(100), bezeichnung: z.string().max(2000),
    faktor: z.number().finite().positive().max(100),
    anzahl: z.number().int().positive().max(10_000),
    preis: amount, gkv_abzug: amount, endpreis: amount,
    begruendung: z.string().max(5000), datum: z.union([billingDate, z.literal("")]).optional(),
    region: z.string().max(100).optional(), material: amount.optional(),
  })).min(1).max(1000),
  gesamtEndpreis: amount, gesamtGKV: amount, gesamtBrutto: amount,
  ratenAnzahl: z.number().int().nonnegative().max(1000), rateProMonat: amount,
  startDatum: billingDate, paketName: z.string().max(500),
  mkvKieferModus: z.enum(["ein", "zwei"]).optional(),
});

// Browser storage is untrusted. This only validates a visual draft, never billing evidence.
export function parseBillingPreview(raw: string | null) {
  if (!raw || raw.length > 2_000_000) return null;
  try {
    const parsed = previewSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

// A clinical YYYY-MM-DD is a calendar day, not an instant in the viewer's timezone.
export function formatBillingServiceDate(value: string | undefined, locale: "de" | "en", shortYear = false) {
  if (!billingDate.safeParse(value).success) return "";
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", {
    timeZone: "UTC", day: "2-digit", month: "2-digit", year: shortYear ? "2-digit" : "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}
