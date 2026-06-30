import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { retryPendingAnimaSignSyncs } from "@/lib/services/animasign-ivoris-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown> = {};
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.EXT_PUBLIC_APP_URL ||
    "https://anima-cura.vercel.app";

  if (process.env.IVORIS_SYNC_ENABLED === "true") {
    try {
      const syncRes = await fetch(`${appUrl}/api/ivoris/patients/batch-sync?startPage=0`, {
        headers: { "Cache-Control": "no-cache" },
      });
      results.ivoris = syncRes.ok ? await syncRes.json() : { error: `HTTP ${syncRes.status}` };
    } catch (e) {
      results.ivoris = { error: String(e) };
    }
  }

  try {
    const db = createServerClient();
    results.animasign = await retryPendingAnimaSignSyncs({ db, limit: 50 });
  } catch (e) {
    results.animasign = { error: String(e) };
  }

  try {
    const db = createServerClient();
    const { count } = await db.from("bank_connections").select("*", { count: "exact", head: true }).eq("status", "connected");
    if (count && count > 0) {
      const { syncBankTransactions } = await import("@/lib/services/bank-sync");
      results.bankSync = await syncBankTransactions({ triggerUpdate: true });
      const { count: ratenCount } = await db.from("raten").select("*", { count: "exact", head: true });
      if (ratenCount && ratenCount > 0) {
        const { runBatchMatching } = await import("@/lib/services/matching-engine");
        results.matching = await runBatchMatching();
      } else {
        results.matching = { skipped: "Keine Ratenplaene" };
      }
    } else {
      results.bankSync = { skipped: "Keine Bankverbindung" };
      results.matching = { skipped: "Keine Bankverbindung" };
    }
  } catch (e) {
    results.bankSync = { error: String(e) };
  }

  try {
    const db = createServerClient();
    const { count: overdueCount } = await db.from("raten").select("*", { count: "exact", head: true }).eq("status", "ueberfaellig");
    if (overdueCount && overdueCount > 0) {
      const { runDunningEngine } = await import("@/lib/services/dunning-engine");
      results.dunning = await runDunningEngine();
    } else {
      results.dunning = { skipped: "Keine ueberfaelligen Raten" };
    }
  } catch (e) {
    results.dunning = { error: String(e) };
  }

  try {
    const executeRes = await fetch(`${appUrl}/api/workflows/execute-all`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    results.workflows = executeRes.ok ? await executeRes.json() : { error: `HTTP ${executeRes.status}` };
  } catch (e) {
    results.workflows = { error: String(e) };
  }

  results.duration_ms = Date.now() - startTime;
  return NextResponse.json({ success: true, results });
}
