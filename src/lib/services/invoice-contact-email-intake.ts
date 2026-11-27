import {createServerClient} from '@/lib/db/supabase';

export type InvoiceContactEmailInput={
 requestId:string;
 tenantId:string;
 campaign:string;
 chatJid:string;
 messageId:string;
 receivedAt:string;
 email:string;
 patients:Array<{patientId:string;firstName?:string;lastName?:string}>;
 actorId?:string|null;
};

export async function processInvoiceContactEmail(input:InvoiceContactEmailInput,fetcher:typeof fetch=fetch){
 const db=createServerClient();
 const email=input.email.trim().toLowerCase();
 const patientIds=Array.from(new Set(input.patients.map(patient=>patient.patientId)));
 const prepared=await db.rpc('prepare_invoice_contact_email',{
  p_request:input.requestId,p_tenant:input.tenantId,p_campaign:input.campaign,
  p_chat:input.chatJid,p_message:input.messageId,p_received:input.receivedAt,
  p_email:email,p_patients:patientIds,p_actor:input.actorId??null,
 });
 if(prepared.error)throw Error('contact_email_prepare_failed');
 const row=prepared.data?.[0];
 if(!row)throw Error('contact_email_prepare_failed');
 if(row.state==='needs_review')return {
  state:'needs_review' as const,errorCode:row.error_code,emailRecordedAt:null,
  invoiceCount:row.invoice_count,deliveryState:'not_queued' as const,
  deliveryQueuedAt:null,accessEmailSentAt:null,
 };
 const secret=process.env.INVOICE_ACCESS_WORKER_SECRET;
 if(!secret)throw Error('invoice_delivery_not_configured');
 const endpoint=process.env.INVOICE_CONTACT_DELIVERY_URL||'https://anima-leitstand.vercel.app/api/abrechnung/notifications/contact-email';
 try{
  const response=await fetcher(endpoint,{
   method:'POST',headers:{'content-type':'application/json','x-invoice-worker-secret':secret},
   body:JSON.stringify({requestId:input.requestId,tenantId:input.tenantId,email,patientIds}),
   cache:'no-store',signal:AbortSignal.timeout(20_000),
  });
  const delivery=await response.json().catch(()=>({code:'invoice_delivery_unavailable'}));
  if(!response.ok){
   const state=response.status>=500?'outcome_unknown':'needs_review';
   await db.from('invoice_contact_email_intakes').update({
    state,error_code:delivery.code??'invoice_delivery_rejected',updated_at:new Date().toISOString(),
   }).eq('id',input.requestId);
   return {
    state,errorCode:delivery.code??'invoice_delivery_rejected',emailRecordedAt:row.email_recorded_at,
    invoiceCount:row.invoice_count,deliveryState:state==='outcome_unknown'?'outcome_unknown':'not_queued',
    deliveryQueuedAt:null,accessEmailSentAt:null,
   };
  }
  const queuedAt=delivery.queuedAt??new Date().toISOString();
  await db.from('invoice_contact_email_intakes').update({
   state:'completed',error_code:null,invoice_count:delivery.invoiceCount??row.invoice_count,
   delivery_queued_at:queuedAt,updated_at:new Date().toISOString(),
  }).eq('id',input.requestId);
  return {
   state:'completed' as const,errorCode:null,emailRecordedAt:row.email_recorded_at,
   invoiceCount:delivery.invoiceCount??row.invoice_count,deliveryState:delivery.deliveryState??'queued',
   deliveryQueuedAt:queuedAt,accessEmailSentAt:null,
  };
 }catch{
  await db.from('invoice_contact_email_intakes').update({
   state:'outcome_unknown',error_code:'invoice_delivery_unavailable',updated_at:new Date().toISOString(),
  }).eq('id',input.requestId);
  return {
   state:'outcome_unknown' as const,errorCode:'invoice_delivery_unavailable',
   emailRecordedAt:row.email_recorded_at,invoiceCount:row.invoice_count,
   deliveryState:'outcome_unknown' as const,deliveryQueuedAt:null,accessEmailSentAt:null,
  };
 }
}
