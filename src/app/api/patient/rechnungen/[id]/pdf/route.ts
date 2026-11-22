import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
import {createServerClient} from "@/lib/db/supabase";
import {loadUploadedPatientInvoicePdf} from "@/lib/patient-uploaded-invoices";
import {resolvePatientInvoicePdf} from "@/lib/patient-invoice-documents";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:{id:string}}) {
  const headers={"Cache-Control":"private, no-store", "Vary":"Cookie", "X-Content-Type-Options":"nosniff"};
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id))return NextResponse.json({code:"invoice_not_found"},{status:404,headers});
  const client=createServerComponentClient();
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return NextResponse.json({code:"sign_in_required"},{status:401,headers});
  // The database checks role=patient and the authoritative profile link. No
  // patient ID from the URL, browser metadata, or a privileged client is used.
  const result=await resolvePatientInvoicePdf((name,args)=>name==="patient_invoice_document_edition"?client.rpc("patient_invoice_document_edition",args):client.rpc("patient_invoice_document_pdf",args),params.id,new URL(request.url).searchParams.get("original")==="1");
  if(!result.bytes){
    if(result.status!==404)return NextResponse.json({code:result.error},{status:result.status,headers});
    const {data:profile,error:profileError}=await client.from("user_profiles").select("role,patient_id").eq("id",user.id).maybeSingle();
    if(profileError)return NextResponse.json({code:"invoice_source_unavailable"},{status:503,headers});
    if(profile?.role!=="patient"||!profile.patient_id)return NextResponse.json({code:"patient_invoice_forbidden"},{status:403,headers});
    const service=createServerClient();
    const {data:memberships,error:membershipError}=await service.from("patient_access_memberships").select("patient_id").eq("user_id",user.id);
    if(membershipError)return NextResponse.json({code:"invoice_source_unavailable"},{status:503,headers});
    const patientIds=Array.from(new Set<string>([profile.patient_id,...(memberships??[]).map(row=>row.patient_id)]));
    try{
      const uploaded=await loadUploadedPatientInvoicePdf(service,patientIds,params.id);
      if(uploaded)return new Response(Buffer.from(uploaded),{headers:{...headers,"Content-Type":"application/pdf",
        "Content-Disposition":`inline; filename="rechnung-${params.id}.pdf"`,"X-Invoice-Edition":"original"}});
    }catch{return NextResponse.json({code:"invoice_source_unavailable"},{status:503,headers});}
    return NextResponse.json({code:result.error},{status:result.status,headers});
  }
  return new Response(new Uint8Array(result.bytes),{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`inline; filename="rechnung-${params.id}.pdf"`,"X-Invoice-Edition":result.edition}});
}
