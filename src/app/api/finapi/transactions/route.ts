import { NextResponse } from "next/server";
import { syncBankTransactions } from "@/lib/services/bank-sync";
import { runBatchMatching } from "@/lib/services/matching-engine";
import { reconcileWaitingKasseTransfers } from "@/lib/services/kasse-transfer-reconciliation";
import { requirePraxisRole } from "@/lib/require-praxis";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  try {
    const bankSync = await syncBankTransactions({ triggerUpdate: true });
    const reconciliation = await reconcileWaitingKasseTransfers();
    const matching = await runBatchMatching();

    return NextResponse.json({
      ok: true,
      bankSync,
      reconciliation,
      matching,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
