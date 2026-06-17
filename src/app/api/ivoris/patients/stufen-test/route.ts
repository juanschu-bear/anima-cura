import { NextResponse } from "next/server";
import { fetchIvorisPatientsRaw } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 300;

// Wegwerf-Diagnose: zaehlt die Werte von Treatment.OrthodontistStage ueber den
// ganzen Patientenstamm. Zeigt, welche Stufe "aktiv" bedeutet und ob die Zahl
// zur Praxis-Schaetzung (~550-600 aktive) passt. Gibt nur Zaehlwerte zurueck,
// keine Patientendaten.
export async function GET() {
  try {
    const all = await fetchIvorisPatientsRaw();
    const list = Array.isArray(all) ? all : [];

    const stufen: Record<string, number> = {};
    for (const p of list) {
      const rec = p as Record<string, unknown>;
      const treatment =
        rec.Treatment && typeof rec.Treatment === "object"
          ? (rec.Treatment as Record<string, unknown>)
          : null;
      const value = treatment ? treatment.OrthodontistStage : undefined;
      const key = value === null || value === undefined || value === "" ? "(leer)" : String(value);
      stufen[key] = (stufen[key] ?? 0) + 1;
    }

    const sortiert = Object.fromEntries(Object.entries(stufen).sort((a, b) => b[1] - a[1]));

    return NextResponse.json({ ok: true, total: list.length, stufen: sortiert });
  } catch (err) {
    return NextResponse.json({ ok: false, fehler: String(err) }, { status: 500 });
  }
}
