import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { runNextPendingAnimaSignStage } from "@/lib/services/animasign-ivoris-sync";
import { reconcilePendingAnimaSignSignatures } from "@/lib/services/animasign-signature-reconciliation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createServerClient();

  const signatureReconciliation = await reconcilePendingAnimaSignSignatures({
    db,
    limit: 10,
    minAgeSeconds: 60,
  });

  const patient = await runNextPendingAnimaSignStage("patient", { db });
  const document = {
    stage: "document" as const,
    found: false,
    reason: "Handled by GitHub Actions sync worker to avoid Vercel timeout on large PDFs",
  };

  return NextResponse.json({
    success: true,
    signatureReconciliation,
    patient,
    document,
    duration_ms: Date.now() - startedAt,
  });
}
