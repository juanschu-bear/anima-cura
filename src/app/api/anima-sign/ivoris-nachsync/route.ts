import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase";
import { updateIvorisPatient, createIvorisPatient } from "@/lib/api/ivoris-client";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  const supabase = createServerClient();

  // Alle heutigen Submissions holen (nicht die Test-Daten von Juni 9)
  const { data: subs, error } = await supabase
    .from("anamnese_submissions")
    .select("id, vorname, nachname, geburtsdatum, email, patient_id, answers, created_at")
    .gte("created_at", "2026-06-23T00:00:00Z")
    .order("created_at", { ascending: true });

  if (error || !subs) {
    return NextResponse.json({ error: error?.message || "Keine Daten" }, { status: 500 });
  }

  const results: Array<{ name: string; action: string; result: string }> = [];

  for (const sub of subs) {
    const answers = (sub.answers || {}) as Record<string, unknown>;
    const name = `${sub.vorname || "?"} ${sub.nachname || "?"}`;

    const ivorisData = {
      Firstname: sub.vorname || "",
      Lastname: sub.nachname || "",
      Birthday: sub.geburtsdatum || "",
      Email: sub.email || "",
      Phone: (answers.patient_telefon as string) || "",
      Mobile: (answers.patient_mobil as string) || "",
      Address: {
        Street: [answers.patient_strasse, answers.patient_hausnummer].filter(Boolean).join(" "),
        Zip: (answers.patient_plz as string) || "",
        City: (answers.patient_wohnort as string) || "",
        Country: "D",
      },
    };

    try {
      if (sub.patient_id) {
        // Bestandspatient: ivoris_id holen und updaten
        const { data: pat } = await supabase
          .from("patients")
          .select("ivoris_id")
          .eq("id", sub.patient_id)
          .maybeSingle();

        if (pat?.ivoris_id) {
          await updateIvorisPatient(pat.ivoris_id, ivorisData);
          results.push({ name, action: "UPDATE", result: `OK (ivoris: ${pat.ivoris_id})` });
        } else {
          results.push({ name, action: "SKIP", result: "Patient-ID vorhanden aber keine Ivoris-ID" });
        }
      } else {
        // Neupatient: in Ivoris anlegen
        const gender = (answers.patient_geschlecht as string) === "Weiblich" ? "Female"
          : (answers.patient_geschlecht as string) === "Männlich" ? "Male" : "Unknown";
        const insurance = (answers.versicherungsart as string)?.includes("Privat") ? "Private" : "Statutory";

        const newIvorisId = await createIvorisPatient({
          ...ivorisData,
          Gender: gender,
          HealthInsurance: insurance,
        });
        results.push({ name, action: "CREATE", result: `OK (neue Ivoris-ID: ${newIvorisId})` });
      }
    } catch (err) {
      results.push({ name, action: sub.patient_id ? "UPDATE" : "CREATE", result: `FEHLER: ${String(err).slice(0, 200)}` });
    }

    // Throttle: 300ms zwischen Aufrufen
    await new Promise((r) => setTimeout(r, 300));
  }

  return NextResponse.json({
    total: subs.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
