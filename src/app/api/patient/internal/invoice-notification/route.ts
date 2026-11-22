import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { sendPushNotification } from "@/lib/push";
import { invoiceNotificationRows,invoiceNotificationDeliveryPatients } from "@/lib/services/invoice-notification-persistence";
import { z } from "zod";
export const runtime = "nodejs";
const bodySchema = z.object({
  patientIds: z.array(z.string().uuid()).min(1),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(2000),
  url: z.string().url().optional(),
  jobId: z.string().uuid(),
  accountId: z.string().uuid().nullish(),
});
export async function POST(request: NextRequest) {
  if (!process.env.INVOICE_ACCESS_WORKER_SECRET || request.headers.get("x-invoice-worker-secret") !== process.env.INVOICE_ACCESS_WORKER_SECRET) return NextResponse.json({ code: "not_authorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const body = parsed.data;
  let ids = Array.from(new Set(body.patientIds));
  const db = createServerClient();
  if (body.accountId) {
    const profile = await db.from("user_profiles").select("role,patient_id").eq("id",body.accountId).maybeSingle();
    const memberships = await db.from("patient_access_memberships").select("patient_id").eq("user_id",body.accountId);
    if (profile.error || memberships.error) return NextResponse.json({code:"account_scope_unavailable"},{status:503});
    // A parent's device and notification list belong to the login's primary patient.
    // The message still names the child whose invoice is being followed up.
    try{ids=invoiceNotificationDeliveryPatients(ids,{role:profile.data?.role??"",patientId:profile.data?.patient_id??null,memberPatientIds:(memberships.data??[]).map(row=>row.patient_id)});}
    catch{return NextResponse.json({code:"account_scope_mismatch"},{status:409});}
  }
  const notices = invoiceNotificationRows({ patientIds: ids, jobId: body.jobId, title: body.title, text: body.text });
  const stored = await db.from("patient_notifications").upsert(notices, { onConflict: "id", ignoreDuplicates: true });
  if (stored.error) return NextResponse.json({ code: "notification_store_failed" }, { status: 503 });
  const subscriptions = await db.from("push_subscriptions").select("patient_id,subscription_json").in("patient_id", ids);
  if (subscriptions.error) return NextResponse.json({ code: "push_read_failed", appNotifications: notices.length }, { status: 503 });
  let pushSent = 0;
  for (const subscription of subscriptions.data ?? []) if (await sendPushNotification(subscription.subscription_json, { title: body.title, body: body.text, url: body.url })) pushSent++;
  return NextResponse.json({ ok: true, appNotifications: notices.length, pushSent });
}
