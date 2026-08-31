import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import {
  decodePatientDocumentRecord,
  encodePatientDocumentName,
  getPatientDocumentTypeOption,
} from "@/lib/patient-document-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Auth check - must be praxis user
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const serviceClient = createServerClient();
  const { data: profile } = await serviceClient
    .from("user_profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !["admin", "verwaltung"].includes(profile.role)) {
    return NextResponse.json({ error: "Nur für Praxis-Mitarbeiter" }, { status: 403 });
  }

  // Parse form data
  const formData = await request.formData();
  const patientId = formData.get("patient_id") as string;
  const rawName = formData.get("name") as string;
  const requestedType = (formData.get("typ") as string) || "sonstiges";
  const file = formData.get("file") as File | null;
  const fallbackName = file?.name ? file.name.replace(/\.[^.]+$/, "") : "";
  const name = String(rawName || fallbackName || "").trim();
  const typeOption = getPatientDocumentTypeOption(requestedType);
  const encodedName = encodePatientDocumentName(name, requestedType);

  if (!patientId || !name) {
    return NextResponse.json({ error: "patient_id und name sind erforderlich" }, { status: 400 });
  }
  if (!file || file.size <= 0) {
    return NextResponse.json({ error: "Bitte eine echte Datei auswählen" }, { status: 400 });
  }

  let fileUrl: string | null = null;

  // Upload file to Supabase Storage if provided
  if (file.size > 0) {
    const ext = file.name.split(".").pop() || "pdf";
    const storagePath = `patient-docs/${patientId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

    const { error: uploadError } = await serviceClient.storage
      .from("documents")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("[admin/dokumente] Upload error:", uploadError.message);
      return NextResponse.json(
        { error: "Datei konnte nicht gespeichert werden: " + uploadError.message },
        { status: 500 },
      );
    } else {
      const { data: urlData } = serviceClient.storage
        .from("documents")
        .getPublicUrl(storagePath);
      fileUrl = urlData?.publicUrl || null;
    }
  }

  // Create document record
  const { data: doc, error } = await serviceClient
    .from("patient_documents")
    .insert({
      patient_id: patientId,
      name: encodedName,
      typ: typeOption.storageType,
      file_url: fileUrl,
    })
    .select("id, name, typ, file_url, hochgeladen_am")
    .single();

  if (error) {
    return NextResponse.json({ error: "Fehler beim Speichern: " + error.message }, { status: 500 });
  }

  return NextResponse.json({ dokument: decodePatientDocumentRecord(doc) });
}

// GET - list documents for a patient (praxis view)
export async function GET(request: NextRequest) {
  const supabase = createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const serviceClient = createServerClient();
  const patientId = request.nextUrl.searchParams.get("patient_id");

  if (!patientId) {
    return NextResponse.json({ error: "patient_id erforderlich" }, { status: 400 });
  }

  const { data: docs } = await serviceClient
    .from("patient_documents")
    .select("id, name, typ, file_url, hochgeladen_am")
    .eq("patient_id", patientId)
    .order("hochgeladen_am", { ascending: false });

  return NextResponse.json({
    dokumente: (docs || []).map((doc) => decodePatientDocumentRecord(doc)),
  });
}
