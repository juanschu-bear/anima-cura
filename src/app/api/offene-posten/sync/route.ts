import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";
import { syncBankTransactions } from "@/lib/services/bank-sync";
import { runBatchMatching } from "@/lib/services/matching-engine";
import { syncOpenItemsByReference } from "@/lib/services/offene-posten-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await requirePraxisRole(["admin", "verwaltung"]);
  if (denied) return denied;

  try {
    const bankSync = await syncBankTransactions({ triggerUpdate: true });
    const matching = await runBatchMatching();
    const repair = await syncOpenItemsByReference({ dryRun: false });

    return NextResponse.json({
      ok: true,
      bankSync,
      matching,
      repair,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisierung fehlgeschlagen";
    console.error("[offene-posten/sync]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
