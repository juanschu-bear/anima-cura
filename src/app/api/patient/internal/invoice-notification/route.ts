import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { sendPushNotification } from "@/lib/push";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  if (!process.env.INVOICE_ACCESS_WORKER_SECRET || request.headers.get("x-invoice-worker-secret") !== process.env.INVOICE_ACCESS_WORKER_SECRET) return NextResponse.json({ code: "not_authorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { patientIds?: unknown[]; title?: string; text?: string; url?: string } | null;
  const ids = Array.isArray(body?.patientIds) ? body!.patientIds.filter((id): id is string => typeof id === "string") : [];
  if (!ids.length || typeof body?.title !== "string" || typeof body?.text !== "string") return NextResponse.json({ code: "invalid_request" }, { status: 400 });
  const db = createServerClient();
  const [profiles, subscriptions] = await Promise.all([
    db.from("user_profiles").select("id,patient_id").eq("role", "patient").in("patient_id", ids),
    db.from("push_subscriptions").select("patient_id,subscription_json").in("patient_id", ids),
  ]);
  let pushSent = 0;
  for (const subscription of subscriptions.data ?? []) if (await sendPushNotification(subscription.subscription_json, { title: body.title, body: body.text, url: body.url })) pushSent++;
  const notices = (profiles.data ?? []).map(profile => ({ patient_id: profile.patient_id, typ: "eingang", titel: body!.title!, text: body!.text! }));
  if (notices.length) await db.from("patient_notifications").insert(notices);
  return NextResponse.json({ ok: true, appNotifications: notices.length, pushSent });
}
