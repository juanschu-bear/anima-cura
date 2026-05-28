import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: List all conversations or messages for a specific patient
export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const sc = createServerClient();
  const patientId = request.nextUrl.searchParams.get("patient_id");

  if (patientId) {
    // Get messages for specific patient
    const { data: messages } = await sc
      .from("patient_messages")
      .select("id, sender, text, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: true })
      .limit(100);

    const { data: patient } = await sc
      .from("patients")
      .select("vorname, nachname")
      .eq("id", patientId)
      .single();

    return NextResponse.json({
      patient: patient ? `${patient.vorname} ${patient.nachname}` : "Unbekannt",
      messages: messages || [],
    });
  }

  // List all conversations (patients who have messages)
  const { data: conversations } = await sc
    .from("patient_messages")
    .select("patient_id, text, sender, created_at")
    .order("created_at", { ascending: false });

  if (!conversations || conversations.length === 0) {
    return NextResponse.json({ conversations: [] });
  }

  // Group by patient, get latest message per patient
  const latestByPatient: Record<string, { patient_id: string; last_message: string; last_sender: string; last_at: string; count: number; unread: number }> = {};
  for (const msg of conversations) {
    if (!latestByPatient[msg.patient_id]) {
      latestByPatient[msg.patient_id] = {
        patient_id: msg.patient_id,
        last_message: msg.text?.slice(0, 80) || "",
        last_sender: msg.sender,
        last_at: msg.created_at,
        count: 0,
        unread: 0,
      };
    }
    latestByPatient[msg.patient_id].count++;
    if (msg.sender === "patient") latestByPatient[msg.patient_id].unread++;
  }

  // Get patient names
  const patIds = Object.keys(latestByPatient);
  const { data: patients } = await sc
    .from("patients")
    .select("id, vorname, nachname")
    .in("id", patIds.length > 0 ? patIds : ["00000000-0000-0000-0000-000000000000"]);

  const patMap: Record<string, string> = {};
  (patients || []).forEach(p => { patMap[p.id] = `${p.vorname} ${p.nachname}`; });

  const convList = Object.values(latestByPatient)
    .map(c => ({ ...c, patient_name: patMap[c.patient_id] || "Unbekannt" }))
    .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

  return NextResponse.json({ conversations: convList });
}

// POST: Send a reply from the practice
export async function POST(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { patient_id, text } = await request.json();
  if (!patient_id || !text) return NextResponse.json({ error: "patient_id und text erforderlich" }, { status: 400 });

  const sc = createServerClient();
  const { error } = await sc.from("patient_messages").insert({
    patient_id,
    sender: "praxis",
    text,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
