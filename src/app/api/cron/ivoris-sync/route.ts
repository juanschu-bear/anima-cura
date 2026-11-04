import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { runNextPendingAnimaSignStage } from "@/lib/services/animasign-ivoris-sync";
import { reconcilePendingAnimaSignSignatures } from "@/lib/services/animasign-signature-reconciliation";
import { retryPendingScribeIvorisPushes } from "@/lib/services/scribe-ivoris-retry";

export const runtime = "nodejs";
export const maxDuration = 300;

// The route runs every minute. Small batches make every invocation a bounded
// stage and let the following invocation continue with the next due records.
const SIGNATURE_BATCH_SIZE = 2;
const SCRIBE_BATCH_SIZE = 2;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createServerClient();

  const signatureReconciliation = await reconcilePendingAnimaSignSignatures({
    db,
    limit: SIGNATURE_BATCH_SIZE,
    minAgeSeconds: 60,
  });
  const scribe = await retryPendingScribeIvorisPushes({ db, limit: SCRIBE_BATCH_SIZE });

  const patient = await runNextPendingAnimaSignStage("patient", { db });
  const document = {
    stage: "document" as const,
    found: false,
    reason: "Handled by GitHub Actions sync worker to avoid Vercel timeout on large PDFs",
  };

  return NextResponse.json({
    success: true,
    scribe,
    signatureReconciliation,
    patient,
    document,
    duration_ms: Date.now() - startedAt,
  });
}
