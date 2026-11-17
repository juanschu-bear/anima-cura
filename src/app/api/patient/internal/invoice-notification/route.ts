import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { sendPushNotification } from "@/lib/push";
import { invoiceNotificationRows } from "@/lib/services/invoice-notification-persistence";
import { z } from "zod";
export const runtime = "nodejs";
const bodySchema = z.object({
  patientIds: z.array(z.string().uuid()).min(1),
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(2000),
  url: z.string().url().optional(),
  jobId: z.string().uuid(),
});
export async function POST(request: NextRequest) {
  if (!process.env.INVOICE_ACCESS_WORKER_SECRET || request.headers.get("x-invoice-worker-secret") !== process.env.INVOICE_ACCESS_WORKER_SECRET) return NextResponse.json({ code: "not_authorized" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const body = parsed.data;
  const ids = Array.from(new Set(body.patientIds));
  const db = createServerClient();
  const notices = invoiceNotificationRows({ patientIds: ids, jobId: body.jobId, title: body.title, text: body.text });
  const stored = await db.from("patient_notifications").upsert(notices, { onConflict: "id", ignoreDuplicates: true });
  if (stored.error) return NextResponse.json({ code: "notification_store_failed" }, { status: 503 });
  const subscriptions = await db.from("push_subscriptions").select("patient_id,subscription_json").in("patient_id", ids);
  if (subscriptions.error) return NextResponse.json({ code: "push_read_failed", appNotifications: notices.length }, { status: 503 });
  let pushSent = 0;
  for (const subscription of subscriptions.data ?? []) if (await sendPushNotification(subscription.subscription_json, { title: body.title, body: body.text, url: body.url })) pushSent++;
  return NextResponse.json({ ok: true, appNotifications: notices.length, pushSent });
}
