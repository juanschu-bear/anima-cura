import { NextResponse } from "next/server";
import { fetchIvorisPatientsPage } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 300;

// Wegwerf-Diagnose: zeigt die Feldnamen eines Patienten aus AllPatients,
// ohne den kompletten Stamm zu ziehen (nur Seite 0). Gibt KEINE Patientendaten
// zurueck, nur die Namen der Felder, damit wir einen Aktiv-Marker finden.
export async function GET() {
  try {
    const page = await fetchIvorisPatientsPage(0);
    const list = Array.isArray(page) ? page : [];
    const first = list[0] as Record<string, unknown> | undefined;
    const treatment =
      first && typeof first.Treatment === "object" && first.Treatment
        ? (first.Treatment as Record<string, unknown>)
        : null;

    return NextResponse.json({
      ok: true,
      anzahl_auf_seite_0: list.length,
      feldnamen: first ? Object.keys(first) : [],
      treatment_feldnamen: treatment ? Object.keys(treatment) : [],
    });
  } catch (err) {
    return NextResponse.json({ ok: false, fehler: String(err) }, { status: 500 });
  }
}
