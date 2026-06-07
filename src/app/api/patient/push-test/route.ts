import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";
import { sendPushNotification } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnose-Route: schickt dem angemeldeten Patienten eine Testnachricht
// an sein eigenes Geraet und meldet im Klartext, woran es haengt.
export async function POST() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  if (!process.env.NEXT_PUBLIC_VAPID_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ ok: false, grund: "vapid_fehlt", detail: "VAPID-Schluessel nicht konfiguriert" });
  }

  const sc = createServerClient();
  const { data: subs } = await sc
    .from("push_subscriptions")
    .select("subscription_json, updated_at")
    .eq("patient_id", patient.patientId);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: false, grund: "kein_abo", detail: "Kein Push-Abo in der Datenbank" });
  }

  let zugestellt = 0;
  for (const sub of subs) {
    if (sub.subscription_json) {
      const ok = await sendPushNotification(sub.subscription_json, {
        title: "Testnachricht",
        body: "Push funktioniert. Diese Nachricht kam vom Anima-Cura-Server.",
        url: "/patient/portal",
      });
      if (ok) zugestellt++;
    }
  }

  return NextResponse.json({
    ok: zugestellt > 0,
    grund: zugestellt > 0 ? "zugestellt" : "versand_abgelehnt",
    detail: `${zugestellt} von ${subs.length} Abos erreicht, Abo-Stand ${new Date(subs[0].updated_at).toLocaleString("de-DE")}`,
  });
}
