import {createServerClient} from './db/supabase';
import {sendEmail} from './services/email-send';
import {storageError} from './scribe-workspace-auth';
import {z} from 'zod';
export function inboxMail(entryId:string,recipient:unknown){
 const email=z.string().email().safeParse(recipient);
 if(!email.success)return null;
 // No clinical/free-text contents in email. Juan follows the authenticated link.
 return {track:false,to:email.data,subject:'Neuer Eintrag in der Scribe-Infobox',body:`<p>Die Praxis hat einen neuen Eintrag erstellt.</p><p><a href="https://scribe.animacura.io/scribe?inbox=${encodeURIComponent(entryId)}">Eintrag öffnen</a></p>`,idempotencyKey:`scribe-inbox-${entryId}`};
}
export async function deliverInboxMail(entryId?:string){
 if(!inboxMail('configuration-check',process.env.SCRIBE_INBOX_EMAIL_TO))return {status:'pending',sent:0,failed:0,reason:'mail_recipient_not_configured'};
 const db=createServerClient();
 const {data,error}=await db.rpc('scribe_claim_inbox_mail',{p_entry:entryId??null});
 if(error)storageError(error);
 let sent=0,failed=0;
 for(const job of data??[]){
  const mail=inboxMail(job.entry_id,process.env.SCRIBE_INBOX_EMAIL_TO);
  // Resend idempotency lasts 24h. Ambiguous older attempts require operator review,
  // never an automatic duplicate after that window.
  const expired=job.attempts>1 && Date.now()-Date.parse(job.created_at)>23*3600_000;
  let ok=false;let reason=expired?'mail_retry_window_expired':!mail?'mail_recipient_not_configured':'mail_delivery_failed';
  if(mail&&!expired){try{ok=(await sendEmail(mail)).ok;}catch{/* durable job remains retryable */}}
  const r=await db.from('scribe_inbox_mail_jobs').update({status:ok?'sent':'failed',sent_at:ok?new Date().toISOString():null,lease_until:null,last_error:ok?null:reason}).eq('entry_id',job.entry_id).eq('attempts',job.attempts);
  if(r.error)storageError(r.error);
  if(ok)sent++;else failed++;
 }
 return {status:failed?'pending':sent?'sent':'unchanged',sent,failed};
}
