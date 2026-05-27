import { NextResponse } from "next/server";
import { requirePatient } from "@/lib/patient-auth";
import { createServerClient } from "@/lib/db/supabase";

export async function GET() {
  const patient = await requirePatient();
  if (patient instanceof NextResponse) return patient;

  const supabase = createServerClient();

  const { data: docs, error } = await supabase
    .from("patient_documents")
    .select("id, name, typ, file_url, hochgeladen_am")
    .eq("patient_id", patient.patientId)
    .order("hochgeladen_am", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Fehler beim Laden" }, { status: 500 });
  }

  return NextResponse.json({
    dokumente: (docs ?? []).map(d => ({
      id: d.id,
      name: d.name,
      typ: d.typ,
      file_url: d.file_url,
      hochgeladen_am: d.hochgeladen_am,
    })),
  });
}
