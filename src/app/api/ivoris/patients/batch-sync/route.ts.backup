import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro

const DEFAULT_RELAY_HOST = "https://relay.computer-konkret.de";
const PAGES_PER_BATCH = 100; // All pages in one go - 93 pages × ~2s = ~200s, fits in 300s maxDuration

async function fetchIvorisPage(page: number) {
  const app = process.env.IVORIS_APP!;
  const appVersion = process.env.IVORIS_APP_VERSION!;
  const apiKey = process.env.IVORIS_API_KEY!;
  const linkname = process.env.IVORIS_LINKNAME!;
  const username = process.env.IVORIS_USERNAME!;
  const password = process.env.IVORIS_PASSWORD!;
  const baseUrl = `${DEFAULT_RELAY_HOST}/relay/${linkname}/webservice/api`;
  const basic = Buffer.from(`${username}:${password}`).toString("base64");

  const url = `${baseUrl}/Patient/v1/AllPatients?app=${encodeURIComponent(app)}&app_version=${encodeURIComponent(appVersion)}&api_key=${encodeURIComponent(apiKey)}&page=${page}`;

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`IVORIS page ${page}: HTTP ${res.status}`);
  return await res.json();
}

function mapGender(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["m", "male", "mann", "männlich"].includes(v)) return "m";
  if (["w", "f", "female", "frau", "weiblich"].includes(v)) return "w";
  if (["d", "divers", "diverse"].includes(v)) return "d";
  return null;
}

function mapInsurance(raw: string | null | undefined): string {
  if (!raw) return "privat";
  const v = raw.toLowerCase();
  if (v.includes("statutory") || v.includes("gesetz") || v.includes("gkv")) return "gesetzlich";
  return "privat";
}

function normalizePatient(raw: any) {
  const ivorisId = raw.Id;
  if (!ivorisId) return null;

  const treatment = raw.Treatment && typeof raw.Treatment === "object" ? raw.Treatment : null;
  const currentInsurance = raw.CurrentInsurance && typeof raw.CurrentInsurance === "object" ? raw.CurrentInsurance : null;
  const address = raw.Address && typeof raw.Address === "object" ? raw.Address : null;

  return {
    ivoris_id: ivorisId,
    vorname: raw.Firstname || "",
    nachname: raw.Lastname || "",
    geburtsdatum: raw.Birthday ? new Date(raw.Birthday).toISOString().slice(0, 10) : null,
    geschlecht: mapGender(raw.Gender),
    kasse: mapInsurance(raw.HealthInsurance),
    versichertennummer: currentInsurance?.InsuranceNumber || null,
    behandlung: treatment?.OrthodontistStage || "Unbekannt",
    behandlung_start: null as string | null,
    telefon: raw.Phone || raw.Mobile || null,
    email: raw.Email || null,
    strasse: address?.Street || null,
    plz: address?.Zip || null,
    ort: address?.City || null,
    land: address?.Country || "DE",
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startPage = parseInt(searchParams.get("startPage") || "0", 10);
  const appUrl = process.env.EXT_PUBLIC_APP_URL || "https://anima-cura.vercel.app";

  const db = createServerClient();
  let totalFetched = 0;
  let totalUpdated = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  let reachedEnd = false;
  const errors: string[] = [];

  for (let page = startPage; page < startPage + PAGES_PER_BATCH; page++) {
    let patients: any[];
    try {
      patients = await fetchIvorisPage(page);
    } catch (e) {
      errors.push(String(e));
      continue;
    }

    if (!Array.isArray(patients) || patients.length === 0) {
      reachedEnd = true;
      break;
    }

    totalFetched += patients.length;

    for (const raw of patients) {
      const normalized = normalizePatient(raw);
      if (!normalized) { totalSkipped++; continue; }

      // Check if patient exists
      const { data: existing } = await db
        .from("patients")
        .select("id")
        .eq("ivoris_id", normalized.ivoris_id)
        .limit(1);

      if (existing && existing.length > 0) {
        // Update
        const { ivoris_id, ...updateFields } = normalized;
        const { error } = await db
          .from("patients")
          .update(updateFields)
          .eq("ivoris_id", ivoris_id);

        if (error) {
          errors.push(`Update ${ivoris_id}: ${error.message}`);
          totalSkipped++;
        } else {
          totalUpdated++;
        }
      } else {
        // Insert
        const { error } = await db.from("patients").insert(normalized);
        if (error) {
          errors.push(`Insert ${normalized.ivoris_id}: ${error.message}`);
          totalSkipped++;
        } else {
          totalInserted++;
        }
      }
    }

    // Throttle between pages
    await new Promise((r) => setTimeout(r, 300));
  }

  const nextPage = reachedEnd ? null : startPage + PAGES_PER_BATCH;

  // Done - no chaining needed, all pages processed in one go

  return NextResponse.json({
    ok: true,
    batch: { startPage, pagesProcessed: Math.min(PAGES_PER_BATCH, (reachedEnd ? 93 : startPage + PAGES_PER_BATCH) - startPage) },
    results: { fetched: totalFetched, updated: totalUpdated, inserted: totalInserted, skipped: totalSkipped },
    errors: errors.slice(0, 20),
    done: reachedEnd,
    nextPage,
    message: reachedEnd
      ? `Sync abgeschlossen! ${totalFetched} Patienten verarbeitet.`
      : `Batch ${startPage}-${startPage + PAGES_PER_BATCH - 1} fertig. Nächster Batch startet automatisch (Seite ${nextPage}).`,
  });
}
