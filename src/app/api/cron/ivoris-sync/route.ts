import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { runNextPendingAnimaSignStage } from "@/lib/services/animasign-ivoris-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createServerClient();

  const patient = await runNextPendingAnimaSignStage("patient", { db });
  const document = await runNextPendingAnimaSignStage("document", {
    db,
    excludeSubmissionIds: patient.submissionId ? [patient.submissionId] : [],
  });

  return NextResponse.json({
    success: true,
    patient,
    document,
    duration_ms: Date.now() - startedAt,
  });
}
