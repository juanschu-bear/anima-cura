// ============================================================
// API ROUTE: /api/cron
// ============================================================
// Wird täglich um 06:00 von Vercel Cron aufgerufen.
// Reihenfolge: Bank-Sync → Matching → Mahnwesen → KI-Analyse
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { syncBankTransactions } from "@/lib/services/bank-sync";
import { runBatchMatching } from "@/lib/services/matching-engine";
import { runDunningEngine } from "@/lib/services/dunning-engine";
import { detectAnomalies, generateCashflowForecast } from "@/lib/services/claude-analysis";
import { syncIvorisPatients } from "@/lib/services/ivoris-sync";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Pro: bis zu 60 Sekunden

export async function GET(req: NextRequest) {
  // Cron-Secret prüfen (verhindert unbefugte Aufrufe)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown> = {};

  try {
    // Schritt 0: Optionale Praxisdaten-Synchronisation (IVORIS)
    if (process.env.IVORIS_SYNC_ENABLED === "true") {
      console.log("🏥 IVORIS Patienten-Sync starten...");
      results.ivoris = await syncIvorisPatients();
    }

    // Schritt 1: Bank-Sync
    console.log("🏦 Bank-Sync starten...");
    results.bankSync = await syncBankTransactions();

    // Schritt 2: Matching
    console.log("🧠 Raten-Matching starten...");
    results.matching = await runBatchMatching();

    // Schritt 3: Mahnwesen
    console.log("📬 Mahnwesen prüfen...");
    results.dunning = await runDunningEngine();

    // Schritt 4: KI-Analyse (async, läuft im Hintergrund)
    console.log("🤖 KI-Analyse starten...");
    results.forecast = await generateCashflowForecast();
    
    // Anomalie-Erkennung nur einmal pro Woche (Montag)
    if (new Date().getDay() === 1) {
      await detectAnomalies();
      results.anomalies = "Anomalie-Analyse durchgeführt";
    }

    results.duration_ms = Date.now() - startTime;
    console.log(`✅ Cron abgeschlossen in ${results.duration_ms}ms`);

    return NextResponse.json({ success: true, results });

  } catch (error) {
    console.error("❌ Cron-Fehler:", error);
    return NextResponse.json(
      { success: false, error: String(error), results },
      { status: 500 }
    );
  }
}
