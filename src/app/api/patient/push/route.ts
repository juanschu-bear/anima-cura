import { NextRequest, NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: Save push subscription
export async function POST(request: NextRequest) {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const body = await request.json();
  const { subscription } = body;

  if (!subscription || !subscription.endpoint) {
    return NextResponse.json({ error: "Ungültige Subscription" }, { status: 400 });
  }

  const sc = createServerClient();

  // Upsert subscription
  const { error } = await sc.from("push_subscriptions").upsert({
    patient_id: patient.patientId,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    subscription_json: JSON.stringify(subscription),
    updated_at: new Date().toISOString(),
  }, { onConflict: "patient_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// DELETE: Remove push subscription
export async function DELETE(request: NextRequest) {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const sc = createServerClient();
  await sc.from("push_subscriptions").delete().eq("patient_id", patient.patientId);

  return NextResponse.json({ success: true });
}
