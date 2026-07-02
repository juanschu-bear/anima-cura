import { NextResponse } from "next/server";
import { fetchIvorisPatientsRaw } from "@/lib/api/ivoris-client";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const authError = await requirePraxisRole(["admin", "verwaltung", "lesezugriff"]);
  if (authError) return authError;

  try {
    const raw: any = await fetchIvorisPatientsRaw();
    const list = raw?.Patients || raw?.patients || raw?.data || raw;
    const first = Array.isArray(list) ? list[0] : list;

    return NextResponse.json({
      ok: true,
      feldnamen: first ? Object.keys(first) : [],
      erster_patient: first ?? null,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, fehler: err?.message ?? String(err) },
      { status: 500 },
    );
  }
}
