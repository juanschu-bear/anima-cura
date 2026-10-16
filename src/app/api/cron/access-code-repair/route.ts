import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { remediateMissingCode } from "@/lib/services/hostinger-support-mail";
import { recordCommunicationEvent } from "@/lib/services/communication-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(request.headers.get("x-vercel-cron") || (secret && request.headers.get("authorization") === `Bearer ${secret}`));
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = createServerClient();
  const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const query = await db.from("communication_messages")
    .select("id,patient_id,recipient,subject,status,created_at,metadata")
    .like("campaign_key", "patient_access_code_%")
    .eq("status", "queued")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(25);
  if (query.error) return NextResponse.json({ error: "queue_unavailable" }, { status: 500 });

  const results: Array<{ id: string; outcome: string }> = [];
  for (const row of query.data ?? []) {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    const attempts = typeof metadata.repairAttempts === "number" ? metadata.repairAttempts : 0;
    if (attempts >= 3) {
      results.push({ id: row.id, outcome: "manual_review_required" });
      continue;
    }
    await db.from("communication_messages").update({
      status: "delayed",
      metadata: { ...metadata, repairAttempts: attempts + 1, repairStartedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("status", "queued");
    try {
      const remediation = await remediateMissingCode({
        event: "message.received",
        eventKey: `stuck-code:${row.id}`,
        mailboxAddress: "praxisteam@animacura.io",
        mailboxResourceId: null,
        senderEmail: row.recipient,
        senderName: null,
        subject: row.subject || "Sicherheitscode nicht zugestellt",
        excerpt: "Der zuvor angeforderte Sicherheitscode wurde vom Versanddienst nicht bestätigt.",
        timestamp: row.created_at,
        uid: null,
        folder: "inbox",
        messageId: null,
      }, `stuck-code:${row.id}`);
      await recordCommunicationEvent({
        messageId: row.id,
        eventType: "failed",
        source: "access_code_watchdog",
        eventKey: `access-code-watchdog:${row.id}`,
        metadata: { reason: "superseded_by_verified_fallback", remediationOutcome: remediation.outcome },
      });
      results.push({ id: row.id, outcome: remediation.outcome });
    } catch (error) {
      await db.from("communication_messages").update({
        status: "queued",
        metadata: { ...metadata, repairAttempts: attempts + 1, repairError: error instanceof Error ? error.message : "repair_failed" },
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, outcome: "retry_scheduled" });
    }
  }
  console.info("[access-code-watchdog]", JSON.stringify({ checked: query.data?.length ?? 0, results }));
  return NextResponse.json({ checked: query.data?.length ?? 0, results }, { headers: { "Cache-Control": "no-store" } });
}
