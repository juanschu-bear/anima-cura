import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { HOSTINGER_SUPPORT_WORKFLOW_ID, remediateMissingCode } from "@/lib/services/hostinger-support-mail";
import { safeRecordCommunicationEvent } from "@/lib/services/communication-ledger";

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

  const results: Array<{ id: string; outcome: string; reason?: string }> = [];
  const eligibleRows = (query.data ?? []).filter(row => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return typeof metadata.nextRepairAt !== "string" || Date.parse(metadata.nextRepairAt) <= Date.now();
  }).slice(0, 1);
  for (const row of eligibleRows) {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    let attempts = typeof metadata.repairAttempts === "number" ? metadata.repairAttempts : 0;
    if (attempts >= 3) {
      const lastAttemptAt = typeof metadata.repairStartedAt === "string" ? Date.parse(metadata.repairStartedAt) : 0;
      if (lastAttemptAt && lastAttemptAt > Date.now() - 65 * 60 * 1000) {
        results.push({ id: row.id, outcome: "retry_cooldown" });
        continue;
      }
      attempts = 0;
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
      }, `stuck-code:${row.id}`, typeof row.patient_id === "string" ? row.patient_id : undefined);
      await safeRecordCommunicationEvent({
        messageId: row.id,
        eventType: "failed",
        source: "access_code_watchdog",
        metadata: { reason: "superseded_by_verified_fallback", remediationOutcome: remediation.outcome },
      });
      await db.from("communication_messages").update({
        status: "failed",
        metadata: { ...metadata, supersededByVerifiedFallback: true, remediationOutcome: remediation.outcome },
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, outcome: remediation.outcome });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "repair_failed";
      const providerLimited = reason.includes("hostinger_mail_rejected:429");
      await db.from("communication_messages").update({
        status: "queued",
        metadata: {
          ...metadata,
          repairAttempts: attempts + 1,
          repairError: reason,
          nextRepairAt: new Date(Date.now() + (providerLimited ? 5 : 1) * 60 * 1000).toISOString(),
        },
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ id: row.id, outcome: "retry_scheduled", reason });
    }
  }
  const supportQuery = await db.from("workflow_runs")
    .select("id,started_at,result")
    .eq("workflow_id", HOSTINGER_SUPPORT_WORKFLOW_ID)
    .order("started_at", { ascending: false })
    .limit(200);
  const supportResults: Array<{ id: string; outcome: string }> = [];
  const pendingBySender = new Map<string, { id: string; started_at: string; result: Record<string, unknown> }>();
  for (const run of supportQuery.data ?? []) {
    const result = run.result && typeof run.result === "object" ? run.result as Record<string, unknown> : {};
    const sender = typeof result.sender === "string" ? result.sender.trim().toLowerCase() : "";
    const subject = typeof result.subject === "string" ? result.subject : "";
    const reason = typeof result.reason === "string" ? result.reason : "";
    if (!sender || result.remediationOutcome || result.caseStatus === "resolved") continue;
    if (reason !== "security_code_not_received" && !(reason === "missing_message_body" && /rechnungszugang|sicherheitscode/i.test(subject))) continue;
    if (!pendingBySender.has(sender)) pendingBySender.set(sender, { id: run.id, started_at: run.started_at, result });
  }
  // Hostinger rate-limits bursts. Perform at most one outbound remediation per
  // watchdog run; unresolved support cases resume after the delivery queue.
  const supportCapacity = eligibleRows.length === 0 ? 1 : 0;
  for (const [sender, run] of Array.from(pendingBySender.entries()).slice(0, supportCapacity)) {
    const recent = await db.from("communication_messages").select("id")
      .eq("recipient", sender)
      .eq("provider", "hostinger")
      .eq("campaign_key", "patient_access_code_recovery")
      .in("status", ["accepted", "delivered", "opened", "clicked"])
      .gte("created_at", new Date(Date.now() - 25 * 60 * 1000).toISOString())
      .limit(1);
    if ((recent.data ?? []).length) {
      await db.from("workflow_runs").update({ result: { ...run.result, caseStatus: "resolved", remediationOutcome: "recent_code_already_sent" } }).eq("id", run.id);
      supportResults.push({ id: run.id, outcome: "recent_code_already_sent" });
      continue;
    }
    try {
      const remediation = await remediateMissingCode({
        event: "message.received",
        eventKey: `support-watchdog:${run.id}`,
        mailboxAddress: "praxisteam@animacura.io",
        mailboxResourceId: null,
        senderEmail: sender,
        senderName: typeof run.result.senderName === "string" ? run.result.senderName : null,
        subject: typeof run.result.subject === "string" ? run.result.subject : "Rechnungszugang",
        excerpt: typeof run.result.excerpt === "string" ? run.result.excerpt : "",
        timestamp: run.started_at,
        uid: typeof run.result.sourceUid === "number" ? run.result.sourceUid : null,
        folder: typeof run.result.sourceFolder === "string" ? run.result.sourceFolder : "inbox",
        messageId: typeof run.result.messageId === "string" ? run.result.messageId : null,
      }, `support-watchdog:${run.id}`);
      await db.from("workflow_runs").update({
        result: {
          ...run.result,
          caseStatus: remediation.outcome === "recovery_code_sent" ? "resolved" : "awaiting_patient",
          remediationOutcome: remediation.outcome,
          replyMode: "access_code_watchdog",
          replyText: remediation.replyText,
        },
      }).eq("id", run.id);
      supportResults.push({ id: run.id, outcome: remediation.outcome });
    } catch (error) {
      supportResults.push({ id: run.id, outcome: error instanceof Error ? error.message : "repair_failed" });
    }
  }
  console.info("[access-code-watchdog]", JSON.stringify({ checked: query.data?.length ?? 0, results, supportResults }));
  return NextResponse.json({ checked: query.data?.length ?? 0, results, supportResults }, { headers: { "Cache-Control": "no-store" } });
}
