import { NextRequest, NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: messages, error } = await supabase
    .from("patient_messages")
    .select("id, sender_type, sender_name, text, gelesen, created_at")
    .eq("patient_id", patient.patientId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  // Mark unread praxis messages as read
  await supabase
    .from("patient_messages")
    .update({ gelesen: true })
    .eq("patient_id", patient.patientId)
    .eq("sender_type", "praxis")
    .eq("gelesen", false);

  return NextResponse.json({
    nachrichten: (messages ?? []).map(m => ({
      id: m.id,
      sender_type: m.sender_type,
      sender_name: m.sender_name,
      text: m.text,
      created_at: m.created_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const body = await request.json();
  const text = body?.text?.trim();

  if (!text || text.length === 0) {
    return NextResponse.json({ error: "Nachricht darf nicht leer sein" }, { status: 400 });
  }

  if (text.length > 2000) {
    return NextResponse.json({ error: "Nachricht zu lang (max. 2000 Zeichen)" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: message, error } = await supabase
    .from("patient_messages")
    .insert({
      patient_id: patient.patientId,
      sender_type: "patient",
      sender_name: patient.name,
      text,
    })
    .select("id, sender_type, sender_name, text, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Fehler beim Senden" }, { status: 500 });
  }

  return NextResponse.json({ nachricht: message });
}
