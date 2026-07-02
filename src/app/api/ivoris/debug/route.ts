import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";

export async function GET() {
  const authError = await requirePraxisRole(["admin", "verwaltung", "lesezugriff"]);
  if (authError) return authError;

  const linkname = process.env.IVORIS_LINKNAME || "(missing)";
  const app = process.env.IVORIS_APP || "(missing)";
  const appVersion = process.env.IVORIS_APP_VERSION || "(missing)";
  const apiKey = process.env.IVORIS_API_KEY || "(missing)";
  const username = process.env.IVORIS_USERNAME || "(missing)";
  const password = process.env.IVORIS_PASSWORD || "(missing)";

  const baseUrl = `https://relay.computer-konkret.de/relay/${linkname}/webservice/api`;
  const url = `${baseUrl}/Patient/v1/AllPatients?app=${app}&app_version=${appVersion}&api_key=${apiKey}&page=0`;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (username !== "(missing)" && password !== "(missing)") {
    headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  }

  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  const text = await res.text();

  return NextResponse.json({
    env: {
      linkname: linkname.slice(0, 8) + "...",
      app,
      appVersion,
      apiKey: apiKey.slice(0, 8) + "...",
      username: username.slice(0, 8) + "...",
      password: password ? password.slice(0, 4) + "..." : "(missing)",
      hasAuth: username !== "(missing)" && password !== "(missing)",
    },
    request: { url: url.replace(apiKey, "***"), status: res.status },
    responsePreview: text.slice(0, 200),
  });
}
