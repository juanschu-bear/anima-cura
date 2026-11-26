import {createHash,randomBytes} from 'node:crypto';
import {createServerClient} from '@/lib/db/supabase';
import {sendEmail} from './email-send';
import {buildInvoiceAccessLinkEmail} from '@/lib/email/invoice-access-link';
import {appRecipients,appAccessScope,appRequestResult,type AppAccessCommand} from './practice-app-access-domain';
const columns='id,vorname,nachname,email,versicherter_vorname,versicherter_nachname,versicherter_email,eb2_vorname,eb2_nachname,eb2_email';
export async function readAppAccess(db:ReturnType<typeof createServerClient>,patientId:string){
 const p=await db.from('patients').select(columns).eq('id',patientId).maybeSingle();if(p.error)throw Error('source_unavailable');if(!p.data)throw Error('patient_not_found');
 const [requests,members,profiles]=await Promise.all([
  db.from('practice_app_access_requests').select('id,state,error_code,created_at,completed_at,recipient_key,email,actor_id').eq('patient_id',patientId).order('created_at',{ascending:false}).limit(10),
  db.from('patient_access_memberships').select('user_id').eq('patient_id',patientId),
  db.from('user_profiles').select('id').eq('patient_id',patientId).eq('role','patient')]);
 if(requests.error||members.error||profiles.error)throw Error('source_unavailable');
 return {patientId,recipients:appRecipients(p.data),account:{state:members.data.length||profiles.data.length?'linked':'not_linked',meaning:'patient_account_association'},requests:requests.data.map(r=>({...appRequestResult(r),recipientKey:r.recipient_key,email:r.email,actorId:r.actor_id})),asOf:new Date().toISOString()};
}
export async function sendAppAccess(db:ReturnType<typeof createServerClient>,actorId:string,c:AppAccessCommand,deliver=sendEmail){
 const p=await db.from('patients').select(columns).eq('id',c.patientId).maybeSingle();if(p.error)throw Error('source_unavailable');if(!p.data)throw Error('patient_not_found');
 const recipient=appRecipients(p.data).find(r=>r.key===c.recipientKey);if(!recipient||recipient.email!==c.expectedEmail.toLowerCase())throw Error('recipient_changed');
 const previous=await db.from('practice_app_access_requests').select('*').eq('id',c.requestId).maybeSingle();if(previous.error)throw Error('source_unavailable');
 if(previous.data){if(previous.data.patient_id!==c.patientId||previous.data.email!==recipient.email||previous.data.recipient_key!==c.recipientKey)throw Error('request_conflict');return appRequestResult(previous.data);}
 const scope=appAccessScope(c.patientId,recipient.email);
 const row={id:c.requestId,patient_id:c.patientId,actor_id:actorId,recipient_key:c.recipientKey,email:recipient.email,scope_key:scope,state:'processing',recipient_confirmed:true};
 const inserted=await db.from('practice_app_access_requests').insert(row).select('*').single();
 if(inserted.error){if(inserted.error.code!=='23505')throw Error('source_unavailable');const same=await db.from('practice_app_access_requests').select('*').eq('scope_key',scope).maybeSingle();if(same.error||!same.data)throw Error('request_conflict');return appRequestResult(same.data);}
 let sending=false;
 try{
  const contact=await db.from('invoice_access_contacts').upsert({email:recipient.email,normalized_email:recipient.email,locale:c.language},{onConflict:'normalized_email',ignoreDuplicates:true});if(contact.error)throw Error('access_prepare_failed');
  const found=await db.from('invoice_access_contacts').select('id').eq('normalized_email',recipient.email).single();if(found.error)throw Error('access_prepare_failed');
  const token=randomBytes(32).toString('base64url');
  const link=await db.from('invoice_access_links').insert({contact_id:found.data.id,token_hash:createHash('sha256').update(token).digest('hex'),patient_ids:[c.patientId],next_path:'/patient/portal',locale:c.language,expires_at:new Date(Date.now()+14*86400000).toISOString()});if(link.error)throw Error('access_prepare_failed');
  const mail=buildInvoiceAccessLinkEmail(`https://animacura.io/patient/invoice-access/continue?token=${encodeURIComponent(token)}&lang=${c.language}&next=${encodeURIComponent('/patient/portal')}`,c.language,'app');
  sending=true;const sent=await deliver({to:recipient.email,subject:mail.subject,body:mail.html,track:false,idempotencyKey:`practice-app-access-${c.requestId}`});
  // A provider error may occur after acceptance. Never auto-retry an uncertain send.
  const state=sent.ok?'accepted':'outcome_unknown';const completed_at=new Date().toISOString();
  const saved=await db.from('practice_app_access_requests').update({state,completed_at,error_code:sent.ok?null:'mail_outcome_unknown'}).eq('id',c.requestId).select('*').single();if(saved.error)throw Error('access_receipt_failed');return appRequestResult(saved.data);
 }catch{
  const state=sending?'outcome_unknown':'failed',error_code=sending?'mail_outcome_unknown':'access_prepare_failed';
  const saved=await db.from('practice_app_access_requests').update({state,error_code,completed_at:new Date().toISOString()}).eq('id',c.requestId).select('*').single();if(saved.error)throw Error('source_unavailable');return appRequestResult(saved.data);
 }
}
