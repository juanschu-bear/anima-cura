import { NextResponse } from "next/server";
import { fetchIvorisPatientsRaw } from "@/lib/api/ivoris-client";
import { syncIvorisPatients } from "@/lib/services/ivoris-sync";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  try {
    // Debug: test raw fetch first
    const raw = await fetchIvorisPatientsRaw();
    console.log(`[SYNC-DEBUG] fetchIvorisPatientsRaw returned: isArray=${Array.isArray(raw)}, length=${Array.isArray(raw) ? raw.length : 'n/a'}, type=${typeof raw}`);
    
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({
        ok: false,
        debug: {
          rawIsArray: Array.isArray(raw),
          rawType: typeof raw,
          rawPreview: JSON.stringify(raw).slice(0, 200),
        },
        error: "fetchIvorisPatientsRaw returned empty - see debug info"
      });
    }

    const result = await syncIvorisPatients();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
