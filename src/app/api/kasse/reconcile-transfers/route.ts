import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";
import { reconcileWaitingKasseTransfers } from "@/lib/services/kasse-transfer-reconciliation";

export const runtime = "nodejs";

export async function POST() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  try {
    const reconciliation = await reconcileWaitingKasseTransfers();
    return NextResponse.json({ ok: true, reconciliation });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
