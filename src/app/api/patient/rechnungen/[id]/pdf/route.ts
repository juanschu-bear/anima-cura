import { NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/db/supabase-server";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:{id:string}}) {
  const headers={"Cache-Control":"private, no-store", "Vary":"Cookie", "X-Content-Type-Options":"nosniff"};
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.id))return NextResponse.json({code:"invoice_not_found"},{status:404,headers});
  const client=createServerComponentClient();
  const {data:{user},error:authError}=await client.auth.getUser();
  if(authError||!user)return NextResponse.json({code:"sign_in_required"},{status:401,headers});
  // The database checks role=patient and the authoritative profile link. No
  // patient ID from the URL, browser metadata, or a privileged client is used.
  const {data,error}=await client.rpc("patient_invoice_document_pdf",{document_id:params.id});
  if(error)return NextResponse.json({code:error.code==="42501"?"patient_invoice_forbidden":"invoice_source_unavailable"},{status:error.code==="42501"?403:503,headers});
  if(typeof data!=="string"||!data)return NextResponse.json({code:"invoice_not_found"},{status:404,headers});
  return new Response(new Uint8Array(Buffer.from(data,"base64")),{headers:{...headers,"Content-Type":"application/pdf","Content-Disposition":`inline; filename="rechnung-${params.id}.pdf"`}});
}
