import { NextResponse } from "next/server";
import { fetchIvorisDocumentation } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 60;

// Liefert das offizielle OpenAPI-Dokument des ivoris-Relays
// (die Endpoint-Liste). Nur lesend, keine Daten der Praxis.
export async function GET() {
  try {
    const doc = await fetchIvorisDocumentation();
    return NextResponse.json({ ok: true, doc });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
