import {NextResponse} from 'next/server';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {createServerClient} from '@/lib/db/supabase';
import {requestInvoiceAccess} from '@/lib/services/invoice-contact-access';
import {loadUploadedPatientInvoicePdf} from '@/lib/patient-uploaded-invoices';
const target=z.object({accountId:z.string().uuid().nullable(),patientId:z.string().uuid(),documentId:z.string().uuid(),email:z.string().email()});
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('verify_upload'),targets:z.array(target).max(100)}),
 z.object({action:z.literal('links'),email:z.string().email(),patientIds:z.array(z.string().uuid()).min(1).max(20),accessRequired:z.boolean(),language:z.enum(['de','en','es'])}),
]);
export async function POST(request:Request){
 const expected=Buffer.from(process.env.INVOICE_ACCESS_WORKER_SECRET??''),actual=Buffer.from(request.headers.get('x-invoice-worker-secret')??'');
 if(!expected.length||actual.length!==expected.length||!timingSafeEqual(expected,actual))return NextResponse.json({code:'not_authorized'},{status:401});
 const parsed=input.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return NextResponse.json({code:'invalid_request'},{status:400});
 const db=createServerClient(),value=parsed.data;
 try{
  if(value.action==='verify_upload'){
   const results=[];
   for(const t of value.targets){
    const patient=await db.from('patients').select('id,email').eq('id',t.patientId).maybeSingle();
    if(patient.error)throw Error('source_unavailable');
    let status='account_scope_mismatch';
    if(patient.data?.email?.trim().toLowerCase()===t.email.trim().toLowerCase()){
     let authorized=!t.accountId;
     if(t.accountId){
      const profile=await db.from('user_profiles').select('patient_id,role').eq('id',t.accountId).maybeSingle();
      const members=await db.from('patient_access_memberships').select('patient_id').eq('user_id',t.accountId);
      if(profile.error||members.error)throw Error('source_unavailable');
      authorized=profile.data?.role==='patient'&&!!profile.data.patient_id&&(profile.data.patient_id===t.patientId||(members.data??[]).some(m=>m.patient_id===t.patientId));
     }
     if(authorized){
      try{const pdf=await loadUploadedPatientInvoicePdf(db,[t.patientId],t.documentId);status=pdf?(t.accountId?'visible':'no_account'):'document_inactive';}
      catch{status='pdf_unavailable';}
     }
    }
    results.push({...t,status});
   }
   return NextResponse.json({results},{headers:{'Cache-Control':'no-store'}});
  }
  const email=value.email.trim().toLowerCase();
  const patients=await db.from('patients').select('id,email').in('id',value.patientIds);
  if(patients.error)throw Error('source_unavailable');
  if(new Set(patients.data.map(p=>p.id)).size!==new Set(value.patientIds).size||patients.data.some(p=>p.email?.trim().toLowerCase()!==email))
   return NextResponse.json({code:'account_scope_mismatch'},{status:409});
  const opted=await db.from('invoice_email_preferences').select('opted_out_at').eq('normalized_email',email).maybeSingle();
  if(opted.error)throw Error('source_unavailable');
  if(opted.data)return NextResponse.json({code:'unsubscribed'},{status:409});
  let accessUrl:string|undefined;
  if(value.accessRequired){
   const access=await requestInvoiceAccess({email,language:value.language,trustedWorker:true,deliver:false});
   if(!('accessToken' in access)||!access.accessToken)throw Error('access_link_unavailable');
   accessUrl=`https://animacura.io/patient/invoice-access/continue?token=${encodeURIComponent(access.accessToken)}&lang=${value.language}`;
  }
  const token=randomBytes(32).toString('base64url');
  const saved=await db.from('invoice_email_optout_links').insert({token_hash:createHash('sha256').update(token).digest('hex'),normalized_email:email});
  if(saved.error)throw Error('source_unavailable');
  return NextResponse.json({accessUrl,unsubscribeUrl:`https://animacura.io/patient/invoice-emails?token=${token}&lang=${value.language}`},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({code:'invoice_followup_unavailable'},{status:503});}
}
