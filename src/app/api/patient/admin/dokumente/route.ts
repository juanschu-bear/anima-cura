import {randomUUID} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import { createServerClient } from "@/lib/db/supabase";
import {
  decodePatientDocumentRecord,
  encodePatientDocumentName,
  getPatientDocumentTypeOption,
  isInvoiceDocumentType,
} from "@/lib/patient-document-types";
import {BILLING_DOCUMENTS_BUCKET,billingDocumentPath,billingDocumentUrl} from "@/lib/billing-document-access";
import {patientInvoicePdfUrl} from "@/lib/patient-uploaded-invoices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATIENT_DOCUMENTS_BUCKET = "documents";

async function uploadPatientDocumentFile(input: {
  serviceClient: ReturnType<typeof createServerClient>;
  file: File;
  storagePath: string;
}) {
  const attemptUpload = () =>
    input.serviceClient.storage.from(PATIENT_DOCUMENTS_BUCKET).upload(input.storagePath, input.file, {
      contentType: input.file.type,
      upsert: false,
    });

  let uploadResult = await attemptUpload();

  if (uploadResult.error?.message?.toLowerCase().includes("bucket not found")) {
    const { error: bucketError } = await input.serviceClient.storage.createBucket(PATIENT_DOCUMENTS_BUCKET, {
      public: true,
      fileSizeLimit: "25MB",
    });

    if (bucketError && !bucketError.message?.toLowerCase().includes("already exists")) {
      return {
        error: bucketError,
      };
    }

    uploadResult = await attemptUpload();
  }

  return uploadResult;
}

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

  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(patientId) || !name) {
    return NextResponse.json({ error: "patient_id und name sind erforderlich" }, { status: 400 });
  }
  if (!file || file.size <= 0) {
    return NextResponse.json({ error: "Bitte eine echte Datei auswählen" }, { status: 400 });
  }

  const invoice=isInvoiceDocumentType(typeOption.value);
  if(invoice){
    if(file.size>25*1024*1024||await file.slice(0,5).text()!=="%PDF-")
      return NextResponse.json({code:"invoice_upload_pdf_required"},{status:400});
    const id=randomUUID(),path=billingDocumentPath(patientId,id);
    const {data:bucket,error:bucketError}=await serviceClient.storage.getBucket(BILLING_DOCUMENTS_BUCKET);
    if(bucketError||bucket?.public!==false)return NextResponse.json({code:"invoice_upload_unavailable"},{status:503});
    const storage=serviceClient.storage.from(BILLING_DOCUMENTS_BUCKET);
    const upload=await storage.upload(path,file,{contentType:"application/pdf",upsert:false});
    if(upload.error)return NextResponse.json({code:"invoice_upload_unavailable"},{status:503});
    const saved=await serviceClient.from("patient_documents").insert({id,patient_id:patientId,name:encodedName,
      typ:typeOption.storageType,file_url:patientInvoicePdfUrl(id)})
      .select("id,name,typ,file_url,hochgeladen_am").single();
    if(saved.error){
      const persisted=await serviceClient.from("patient_documents").select("id").eq("id",id).maybeSingle();
      if(!persisted.error&&!persisted.data)await storage.remove([path]);
      return NextResponse.json({code:"invoice_upload_unavailable"},{status:503});
    }
    return NextResponse.json({dokument:decodePatientDocumentRecord({...saved.data,file_url:billingDocumentUrl(id)}),destination:"rechnungen"});
  }

  let fileUrl: string | null = null;

  // Upload file to Supabase Storage if provided
  if (file.size > 0) {
    const ext = file.name.split(".").pop() || "pdf";
    const storagePath = `patient-docs/${patientId}/${Date.now()}-${name.replace(/[^a-zA-Z0-9]/g, "_")}.${ext}`;

    const { error: uploadError } = await uploadPatientDocumentFile({
      serviceClient,
      file,
      storagePath,
    });

    if (uploadError) {
      console.error("[admin/dokumente] Upload error:", uploadError.message);
      return NextResponse.json(
        { error: "Datei konnte nicht gespeichert werden: " + uploadError.message },
        { status: 500 },
      );
    } else {
      const { data: urlData } = serviceClient.storage
        .from(PATIENT_DOCUMENTS_BUCKET)
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
  const {data:profile}=await serviceClient.from("user_profiles").select("role").eq("id",user.id).maybeSingle();
  if(!profile||!["admin","verwaltung"].includes(profile.role))
    return NextResponse.json({code:"document_access_forbidden"},{status:403});
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
    dokumente: (docs || []).map(doc=>decodePatientDocumentRecord(doc.file_url===patientInvoicePdfUrl(doc.id)?{...doc,file_url:billingDocumentUrl(doc.id)}:doc)),
  });
}
