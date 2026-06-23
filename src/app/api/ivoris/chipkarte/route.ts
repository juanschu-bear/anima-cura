import { NextResponse } from "next/server";

export const runtime = "nodejs";

function buildIvorisUrl(path: string, params?: Record<string, string>) {
  const linkname = process.env.IVORIS_LINKNAME;
  const app = process.env.IVORIS_APP;
  const appVersion = process.env.IVORIS_APP_VERSION;
  const apiKey = process.env.IVORIS_API_KEY;
  const relayHost = process.env.IVORIS_RELAY_HOST || "https://relay.computer-konkret.de";

  if (!linkname || !app || !appVersion || !apiKey) {
    throw new Error("IVORIS env vars missing");
  }

  const url = new URL(`${relayHost}/relay/${linkname}/webservice/api/${path}`);
  url.searchParams.set("app", app);
  url.searchParams.set("app_version", appVersion);
  url.searchParams.set("api_key", apiKey);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const username = process.env.IVORIS_USERNAME;
  const password = process.env.IVORIS_PASSWORD;
  if (username && password) {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }
  return headers;
}

export async function GET() {
  try {
    const headers = getAuthHeaders();
    const results: Record<string, unknown> = {};

    // 1. ChipReadDate endpoint
    try {
      const chipUrl = buildIvorisUrl("Patient/v1/ChipReadDate");
      const chipRes = await fetch(chipUrl, { headers, cache: "no-store" });
      const chipText = await chipRes.text();
      results.chipReadDate = {
        status: chipRes.status,
        url: chipUrl.replace(process.env.IVORIS_API_KEY || "", "***"),
        data: chipText.slice(0, 2000),
      };
    } catch (e) {
      results.chipReadDate = { error: String(e) };
    }

    // 2. Raw patient data (first 3 patients) to see HealthInsurance fields
    try {
      const patUrl = buildIvorisUrl("Patient/v1/AllPatients", { page: "0" });
      const patRes = await fetch(patUrl, { headers, cache: "no-store" });
      const patText = await patRes.text();
      const patients = JSON.parse(patText);
      
      // Extract first 3 patients with ALL fields visible
      const sample = (patients as unknown[]).slice(0, 3).map((p: unknown) => {
        const pat = p as Record<string, unknown>;
        return {
          Id: pat.Id,
          Firstname: pat.Firstname,
          Lastname: pat.Lastname,
          HealthInsurance: pat.HealthInsurance,
          CurrentInsurance: pat.CurrentInsurance,
          InsuranceType: pat.InsuranceType,
          Insurance: pat.Insurance,
          // Dump all top-level keys to see what exists
          _allKeys: Object.keys(pat),
        };
      });
      results.rawPatients = { status: patRes.status, sample };
    } catch (e) {
      results.rawPatients = { error: String(e) };
    }

    // 3. Single patient with FULL raw dump (first patient)
    try {
      const patUrl = buildIvorisUrl("Patient/v1/AllPatients", { page: "0" });
      const patRes = await fetch(patUrl, { headers, cache: "no-store" });
      const patients = await patRes.json();
      if (Array.isArray(patients) && patients.length > 0) {
        results.fullPatientDump = patients[0];
      }
    } catch (e) {
      results.fullPatientDump = { error: String(e) };
    }

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
