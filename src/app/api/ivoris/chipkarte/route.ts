import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";

function buildUrl(path: string, params?: Record<string, string>) {
  const lk = process.env.IVORIS_LINKNAME!;
  const rh = process.env.IVORIS_RELAY_HOST || "https://relay.computer-konkret.de";
  const url = new URL(`${rh}/relay/${lk}/webservice/api/${path}`);
  url.searchParams.set("app", process.env.IVORIS_APP!);
  url.searchParams.set("app_version", process.env.IVORIS_APP_VERSION!);
  url.searchParams.set("api_key", process.env.IVORIS_API_KEY!);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/json" };
  const u = process.env.IVORIS_USERNAME, p = process.env.IVORIS_PASSWORD;
  if (u && p) h.Authorization = "Basic " + Buffer.from(u + ":" + p).toString("base64");
  return h;
}

async function tryFetch(label: string, path: string, params?: Record<string, string>) {
  try {
    const url = buildUrl(path, params);
    const res = await fetch(url, { headers: headers(), cache: "no-store" });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    return { label, status: res.status, data: parsed ?? text.slice(0, 3000) };
  } catch (e) { return { label, error: String(e) }; }
}

export async function GET(req: Request) {
  const authError = await requirePraxisRole(["admin", "verwaltung", "lesezugriff"]);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId") || "ccd09c7e-3fac-47ae-8b00-7d942449c0a1";

  const results = await Promise.all([
    // 1. ChipReadDate without params
    tryFetch("ChipReadDate (no params)", "Patient/v1/ChipReadDate"),
    // 2. ChipReadDate with patientId
    tryFetch("ChipReadDate (with patientId)", "Patient/v1/ChipReadDate", { id: patientId }),
    // 3. ChipReadDate with patientId as path
    tryFetch("ChipReadDate (path style)", "Patient/v1/ChipReadDate/" + patientId),
    // 4. Single Patient (might have more fields than AllPatients)
    tryFetch("GetPatient (single)", "Patient/v1/Patient", { id: patientId }),
    // 5. GetPatients (paginated, might differ from AllPatients)
    tryFetch("GetPatients (paginated)", "Patient/v1/Patients", { page: "0" }),
    // 6. Patient Characteristics (might store Krankenkasse as characteristic)
    tryFetch("PatientCharacteristics", "PatientCharacteristic/v1/Patient/" + patientId + "/AllCharacteristics"),
    // 7. All characteristic templates (to see what fields exist)
    tryFetch("CharacteristicTemplates", "PatientCharacteristic/v1/AllTemplates"),
  ]);

  return NextResponse.json({ patientId, results }, { status: 200 });
}
