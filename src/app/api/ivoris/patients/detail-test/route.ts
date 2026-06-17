import { NextResponse } from "next/server";
import { fetchIvorisPatientsPage, fetchIvorisPatientById } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 300;

// Wegwerf-Diagnose: vergleicht die Felder des Einzel-Patient-Endpoints
// (GET /Patient/v1/Patient?id=) mit der Liste. Gibt nur Feldnamen zurueck,
// kein PII, um zu sehen ob das Detail ein Aktiv-Signal (Datum/Status) traegt.
export async function GET() {
  try {
    const page = await fetchIvorisPatientsPage(0);
    const list = Array.isArray(page) ? page : [];
    const first = list[0] as Record<string, unknown> | undefined;
    const id = first && typeof first.Id !== "undefined" && first.Id !== null ? String(first.Id) : null;
    if (!id) {
      return NextResponse.json({ ok: false, fehler: "Keine Id auf Seite 0 gefunden" }, { status: 404 });
    }

    const detail = await fetchIvorisPatientById(id);
    const raw = Array.isArray(detail) ? detail[0] : detail;
    const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

    const nested: Record<string, string[]> = {};
    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === "object" && !Array.isArray(v)) {
          nested[k] = Object.keys(v as Record<string, unknown>);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      detail_feldnamen: obj ? Object.keys(obj) : [],
      verschachtelte_objekte: nested,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, fehler: String(err) }, { status: 500 });
  }
}
