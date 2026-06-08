import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import { sendPushNotification } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Benachrichtigt den Patienten ueber eine Guthaben-Verrechnung an der
// Praxis-Kasse: Eintrag in der Portal-Glocke plus echte Push-Nachricht,
// falls der Patient Push aktiviert hat. Wird von der Kasse aufgerufen
// und darf die Zahlung selbst nie blockieren.
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { patient_id, betrag, leistung, rest } = await request.json();
  if (!patient_id || !betrag) {
    return NextResponse.json({ error: "patient_id und betrag erforderlich" }, { status: 400 });
  }

  const sc = createServerClient();
  const betragStr = Number(betrag).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  const restStr = Number(rest ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2 });
  const titel = "Guthaben verrechnet";
  const text = `${betragStr} € wurden heute an der Praxis-Kasse von deinem Guthaben verrechnet (${leistung || "Leistung"}). Verbleibendes Guthaben: ${restStr} €.`;

  await sc.from("patient_notifications").insert({
    patient_id,
    typ: "balance",
    titel,
    text,
    gelesen: false,
  });

  const { data: subs } = await sc
    .from("push_subscriptions")
    .select("subscription_json")
    .eq("patient_id", patient_id);

  // Push ist bewusst nur ein Anreisser ohne Details: Er soll zum Oeffnen
  // bewegen, damit das Lesen (geoeffnet/bestaetigt) in der App getrackt
  // wird. Der volle Text steht in der Glocke (patient_notifications).
  const pushBody = "Tipp hier, um zu sehen, was gerade mit deinem Guthaben passiert ist.";
  for (const sub of subs ?? []) {
    if (sub.subscription_json) {
      await sendPushNotification(sub.subscription_json, { title: titel, body: pushBody, url: "/patient/portal" });
    }
  }

  return NextResponse.json({ ok: true });
}
