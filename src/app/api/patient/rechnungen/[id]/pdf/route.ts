import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
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
  if(!result.bytes)return NextResponse.json({code:result.error},{status:result.status,headers});
  return new Response(new Uint8Array(result.bytes),{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`inline; filename="rechnung-${params.id}.pdf"`,"X-Invoice-Edition":result.edition}});
}
