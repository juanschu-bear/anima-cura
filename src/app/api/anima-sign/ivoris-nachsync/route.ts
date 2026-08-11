import { NextResponse } from "next/server";
import { requirePraxisRole } from "@/lib/require-praxis";
import { retryPendingAnimaSignSyncs } from "@/lib/services/animasign-ivoris-sync";

export async function POST() {
  const authError = await requirePraxisRole(["admin", "verwaltung"]);
  if (authError) return authError;

  try {
    const summary = await retryPendingAnimaSignSyncs({ limit: 50 });
    return NextResponse.json({
      status: "OK",
      processed: summary.processed,
      patientSuccess: summary.patientSuccess,
      documentSuccess: summary.documentSuccess,
      failures: summary.failures,
      results: summary.results,
      message:
        summary.processed === 0
          ? "Keine faelligen AnimaSign-Syncs gefunden."
          : `${summary.processed} offene AnimaSign-Syncs verarbeitet.`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
