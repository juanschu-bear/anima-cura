import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { hasReliablePatientIdentity, isSafeDunningRate } from "@/lib/patient-safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: Run notification check (called by Vercel Cron or manually from dashboard)
export async function GET(request: NextRequest) {
  // Simple auth check - either cron secret or authenticated user
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && !request.headers.get("x-vercel-cron")) {
    // Check if it's an authenticated admin user
    const { createServerComponentClient } = await import("@/lib/db/supabase-server");
    const supabase = createServerComponentClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const sc = createServerClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const in3Days = new Date(now.getTime() + 3 * 864e5).toISOString().slice(0, 10);
  
  let created = 0;

  // 1. Rates due in next 3 days - remind patient
  const { data: faelligBald } = await sc
    .from("raten")
    .select("id, patient_id, betrag, faellig_am, rate_nummer, bezahlt_am, patients:patient_id(id, vorname, nachname, ivoris_nummer, ivoris_id, behandlung)")
    .eq("status", "offen")
    .gte("faellig_am", today)
    .lte("faellig_am", in3Days);

  const sichereFaelligBald = (faelligBald || []).filter((rate: any) => isSafeDunningRate(rate, rate.patients));

  for (const rate of sichereFaelligBald) {
    const tage = Math.ceil((new Date(rate.faellig_am).getTime() - now.getTime()) / 864e5);
    const exists = await sc
      .from("patient_notifications")
      .select("id")
      .eq("patient_id", rate.patient_id)
      .eq("typ", "rate_faellig")
      .gte("created_at", new Date(now.getTime() - 7 * 864e5).toISOString())
      .limit(1);
    
    if ((exists.data || []).length === 0) {
      await sc.from("patient_notifications").insert({
        patient_id: rate.patient_id,
        typ: "rate_faellig",
        titel: tage === 0 ? "Rate heute fällig" : `Rate in ${tage} Tagen fällig`,
        text: `Deine Rate ${rate.rate_nummer} über ${Number(rate.betrag).toLocaleString("de-DE")} € ist am ${new Date(rate.faellig_am).toLocaleDateString("de-DE")} fällig.`,
        gelesen: false,
      });
      created++;
    }
  }

  // 2. Rates that are now overdue
  const { data: ueberfaellig } = await sc
    .from("raten")
    .select("id, patient_id, betrag, faellig_am, rate_nummer, mahnstufe, bezahlt_am, patients:patient_id(id, vorname, nachname, ivoris_nummer, ivoris_id, behandlung)")
    .eq("status", "offen")
    .lt("faellig_am", today);

  const sichereUeberfaellig = (ueberfaellig || []).filter((rate: any) => isSafeDunningRate(rate, rate.patients));

  for (const rate of sichereUeberfaellig) {
    const tage = Math.floor((now.getTime() - new Date(rate.faellig_am).getTime()) / 864e5);
    
    // Update status to überfällig
    let mahnstufe = 1;
    if (tage > 30) mahnstufe = 2;
    if (tage > 60) mahnstufe = 3;
    
    await sc.from("raten").update({ status: "überfällig", mahnstufe }).eq("id", rate.id);

    // Create notification (max once per week per rate)
    const exists = await sc
      .from("patient_notifications")
      .select("id")
      .eq("patient_id", rate.patient_id)
      .eq("typ", "rate_ueberfaellig")
      .gte("created_at", new Date(now.getTime() - 7 * 864e5).toISOString())
      .limit(1);

    if ((exists.data || []).length === 0) {
      await sc.from("patient_notifications").insert({
        patient_id: rate.patient_id,
        typ: "rate_ueberfaellig",
        titel: `Rate ${tage} Tage überfällig`,
        text: `Deine Rate ${rate.rate_nummer} über ${Number(rate.betrag).toLocaleString("de-DE")} € war am ${new Date(rate.faellig_am).toLocaleDateString("de-DE")} fällig. Bitte überweise den Betrag schnellstmöglich.`,
        gelesen: false,
      });
      created++;
    }
  }

  // 3. Recently paid rates - thank you notification
  const yesterday = new Date(now.getTime() - 864e5).toISOString().slice(0, 10);
  const { data: bezahlt } = await sc
    .from("raten")
    .select("id, patient_id, betrag, bezahlt_am, rate_nummer, patients:patient_id(id, vorname, nachname, ivoris_nummer, ivoris_id, behandlung)")
    .eq("status", "bezahlt")
    .gte("bezahlt_am", yesterday)
    .lte("bezahlt_am", today);

  const sichereBezahlt = (bezahlt || []).filter((rate: any) => hasReliablePatientIdentity(rate.patients));

  for (const rate of sichereBezahlt) {
    const exists = await sc
      .from("patient_notifications")
      .select("id")
      .eq("patient_id", rate.patient_id)
      .eq("typ", "rate_bezahlt")
      .gte("created_at", new Date(now.getTime() - 2 * 864e5).toISOString())
      .limit(1);

    if ((exists.data || []).length === 0) {
      await sc.from("patient_notifications").insert({
        patient_id: rate.patient_id,
        typ: "rate_bezahlt",
        titel: "Zahlung erhalten",
        text: `Vielen Dank! Deine Rate ${rate.rate_nummer} über ${Number(rate.betrag).toLocaleString("de-DE")} € wurde verbucht.`,
        gelesen: false,
      });
      created++;
    }
  }

  // 4. Negative Event Detection: Rate fällig in 3 Tagen aber AnimaPay nicht geöffnet
  let negativeEvents = 0;
  for (const rate of sichereFaelligBald) {
    const { data: recentAnimaPay } = await sc
      .from("patient_engagement")
      .select("id")
      .eq("patient_id", rate.patient_id)
      .eq("event_type", "animapay_open")
      .gte("created_at", new Date(now.getTime() - 7 * 864e5).toISOString())
      .limit(1);

    if (!recentAnimaPay || recentAnimaPay.length === 0) {
      // Write as engagement event for profiling
      await sc.from("patient_engagement").insert({
        patient_id: rate.patient_id,
        event_type: "negative_event",
        metadata: { reason: "rate_faellig_animapay_nicht_geoeffnet", rate_id: rate.id, betrag: rate.betrag },
      });
      negativeEvents++;
    }
  }

  // 5. Track push_sent count for each notification created
  // (Already tracked above by the created counter)

  return NextResponse.json({
    success: true,
    created,
    negative_events: negativeEvents,
    checked: {
      faellig_bald: sichereFaelligBald.length,
      ueberfaellig: sichereUeberfaellig.length,
      bezahlt: sichereBezahlt.length,
    },
    timestamp: now.toISOString(),
  });
}
