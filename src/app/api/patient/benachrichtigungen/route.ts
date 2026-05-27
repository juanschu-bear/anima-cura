import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: notifs, error } = await supabase
    .from("patient_notifications")
    .select("id, typ, titel, text, gelesen, created_at")
    .eq("patient_id", patient.patientId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  // Mark all as read
  await supabase
    .from("patient_notifications")
    .update({ gelesen: true })
    .eq("patient_id", patient.patientId)
    .eq("gelesen", false);

  const ungelesen = (notifs ?? []).filter(n => !n.gelesen).length;

  return NextResponse.json({
    benachrichtigungen: (notifs ?? []).map(n => ({
      id: n.id,
      typ: n.typ,
      titel: n.titel,
      text: n.text,
      gelesen: n.gelesen,
      created_at: n.created_at,
    })),
    ungelesen,
  });
}
