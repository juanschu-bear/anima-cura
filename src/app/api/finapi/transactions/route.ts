import { NextResponse } from "next/server";
import { syncBankTransactions } from "@/lib/services/bank-sync";
import { runBatchMatching } from "@/lib/services/matching-engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const bankSync = await syncBankTransactions();
    const matching = await runBatchMatching();

    return NextResponse.json({
      ok: true,
      bankSync,
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
