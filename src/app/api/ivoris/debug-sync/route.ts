import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const linkname = process.env.IVORIS_LINKNAME!;
  const app = process.env.IVORIS_APP!;
  const appVersion = process.env.IVORIS_APP_VERSION!;
  const apiKey = process.env.IVORIS_API_KEY!;
  const username = process.env.IVORIS_USERNAME!;
  const password = process.env.IVORIS_PASSWORD!;

  const baseUrl = `https://relay.computer-konkret.de/relay/${linkname}/webservice/api`;
  const url = `${baseUrl}/Patient/v1/AllPatients?app=${app}&app_version=${appVersion}&api_key=${apiKey}&page=0`;

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, text/html, */*",
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  };

  const res = await fetch(url, { method: "GET", headers, cache: "no-store" });
  const rawText = await res.text();

  let parsed: unknown = null;
  let parseError: string | null = null;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    parseError = String(e);
  }

  return NextResponse.json({
    status: res.status,
    rawTextLength: rawText.length,
    rawTextFirst50: rawText.slice(0, 50),
    rawTextLast50: rawText.slice(-50),
    firstCharCode: rawText.charCodeAt(0),
    parsedIsArray: Array.isArray(parsed),
    parsedLength: Array.isArray(parsed) ? parsed.length : null,
    parseError,
  });
}
