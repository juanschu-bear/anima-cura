import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel Pro

const DEFAULT_RELAY_HOST = "https://relay.computer-konkret.de";
const PAGES_PER_BATCH = 100; // alle Seiten in einem Durchlauf

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
  if (["m", "male", "mann", "maennlich", "männlich"].includes(v)) return "m";
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

  const db = createServerClient();
  let totalFetched = 0;
  let totalUpserted = 0;
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

    const rows: NonNullable<ReturnType<typeof normalizePatient>>[] = [];
    for (const raw of patients) {
      const normalized = normalizePatient(raw);
      if (!normalized) { totalSkipped++; continue; }
      rows.push(normalized);
    }

    if (rows.length === 0) continue;

    const { error } = await db
      .from("patients")
      .upsert(rows, { onConflict: "ivoris_id" });

    if (error) {
      errors.push(`Upsert Seite ${page}: ${error.message}`);
      totalSkipped += rows.length;
    } else {
      totalUpserted += rows.length;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  const nextPage = reachedEnd ? null : startPage + PAGES_PER_BATCH;

  return NextResponse.json({
    ok: true,
    batch: { startPage },
    results: { fetched: totalFetched, upserted: totalUpserted, skipped: totalSkipped },
    errors: errors.slice(0, 20),
    done: reachedEnd,
    nextPage,
    message: reachedEnd
      ? `Sync abgeschlossen. ${totalFetched} Patienten verarbeitet, ${totalUpserted} geschrieben.`
      : `Batch ab Seite ${startPage} fertig.`,
  });
}
