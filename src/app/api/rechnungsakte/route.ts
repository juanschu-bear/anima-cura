import {createServerClient} from '@/lib/db/supabase';
import {loadUploadedPatientInvoicePdf} from '@/lib/patient-uploaded-invoices';
import {recordInvoiceEngagement} from '@/lib/services/invoice-engagement';
import {createServerComponentClient} from '@/lib/db/supabase-server';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const db=createServerComponentClient();const {data:{user},error}=await db.auth.getUser();
 if(error||!user)return Response.json({code:'sign_in_required'},{status:401});
 const profile=await db.from('user_profiles').select('role').eq('id',user.id).maybeSingle();
 if(profile.error||!profile.data)return Response.json({code:'forbidden'},{status:403});
 const q=new URL(request.url).searchParams,secret=process.env.INVOICE_ACCESS_WORKER_SECRET;
 if(!secret)return Response.json({code:'invoice_record_unavailable'},{status:503});
 try{
  const response=await fetch('https://anima-leitstand.vercel.app/api/abrechnung/invoice-records',{method:'POST',headers:{'content-type':'application/json','x-invoice-worker-secret':secret},body:JSON.stringify({accountId:user.id,mode:profile.data.role==='patient'?'patient':'practice',patientId:q.get('patientId'),documentId:q.get('documentId')??undefined}),cache:'no-store',signal:AbortSignal.timeout(20000)});
  if(response.ok&&q.get('historyId')){
   const data=await response.json(),id=q.get('historyId')!;
   const owner=data.records.find((r:any)=>r.history.some((h:any)=>h.documentId===id))?.patientId??data.unmatchedHistory.find((h:any)=>h.id===id)?.patient_id;
   if(!owner)return Response.json({code:'invoice_not_found'},{status:404});
   const bytes=await loadUploadedPatientInvoicePdf(createServerClient(),[owner],id);
   if(!bytes)return Response.json({code:'invoice_not_found'},{status:404});
   if(profile.data.role==='patient')await recordInvoiceEngagement(user.id,id,'pdf_retrieved',owner);
   return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','Vary':'Cookie'}});
  }
  if(response.ok&&q.get('documentId')&&profile.data.role==='patient'){
   const owner=response.headers.get('x-invoice-patient');
   if(!owner)throw Error('invoice_owner_unavailable');
   await recordInvoiceEngagement(user.id,q.get('documentId')!,'pdf_retrieved',owner);
  }
  return new Response(response.body,{status:response.status,headers:{'Content-Type':response.headers.get('content-type')??'application/json','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff',...(response.headers.get('server-timing')?{'Server-Timing':response.headers.get('server-timing')!}:{})}});
 }catch{return Response.json({code:'invoice_record_unavailable'},{status:503});}
}
