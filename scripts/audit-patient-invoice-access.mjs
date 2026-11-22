/** Read-only production cohort audit. Outputs aggregates only; never prints tokens or patient identities. */
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname,'zymqxzhjbcxzhzvjqvbv.supabase.co');
const db=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function all(table,cols,filter=q=>q,order='id'){
 const out=[];for(let n=0;;n+=1000){let q=filter(db.from(table).select(cols));for(const col of order.split(','))q=q.order(col);
 const {data,error}=await q.range(n,n+999);if(error)throw Error(table+':'+error.code);out.push(...data);if(data.length<1000)return out;}
}
const [notices,profiles,members,contacts,links,events,docs]=await Promise.all([
 all('patient_notifications','id,patient_id,titel,created_at',q=>q.gte('created_at','2026-10-12T22:00:00Z').lt('created_at','2026-10-13T22:00:00Z').eq('titel','Neue Rechnung 3/2026 verfügbar')),
 all('user_profiles','id,patient_id'),all('patient_access_memberships','user_id,patient_id',q=>q,'user_id,patient_id'),
 all('invoice_access_contact_patients','contact_id,patient_id',q=>q,'contact_id,patient_id'),
 all('invoice_access_links','id,contact_id,requested_at,expires_at,consumed_at'),
 all('invoice_access_events','id,contact_id,patient_id,event,occurred_at'),
 all('patient_documents','id,patient_id,typ,name,file_url,hochgeladen_am',q=>q.like('name','[[typ:rechnung]]%')),
]);
const linked=new Set([...profiles,...members].map(p=>p.patient_id));const cohort=[...new Set(notices.map(p=>p.patient_id))];const missing=cohort.filter(p=>!linked.has(p));
const now=Date.now();
const stats={asOf:new Date(now).toISOString(),cohort:cohort.length,withoutProfileOrMembership:missing.length,withContact:0,withMailSentEvent:0,withPageOpenedEvent:0,withAnyLink:0,withUnconsumedUnexpiredLink:0,withOnlyExpiredUnconsumedLinks:0,withConsumedLink:0,noLink:0};
for(const p of missing){
 const ids=new Set(contacts.filter(c=>c.patient_id===p).map(c=>c.contact_id));const ls=links.filter(l=>ids.has(l.contact_id));const es=events.filter(e=>ids.has(e.contact_id)||e.patient_id===p);
 stats.withContact+=ids.size>0;stats.withMailSentEvent+=es.some(e=>e.event==='mail_sent');stats.withPageOpenedEvent+=es.some(e=>e.event==='page_opened');stats.withAnyLink+=ls.length>0;stats.withUnconsumedUnexpiredLink+=ls.some(l=>!l.consumed_at&&Date.parse(l.expires_at)>now);stats.withOnlyExpiredUnconsumedLinks+=ls.length>0&&ls.every(l=>!l.consumed_at&&Date.parse(l.expires_at)<=now);stats.withConsumedLink+=ls.some(l=>l.consumed_at);stats.noLink+=ls.length===0;
}
const documentTargets={};for(const d of docs){let path;try{path=new URL(d.file_url,'https://animacura.io').pathname;path=path.startsWith('/api/patient/dokumente/')?'/api/patient/dokumente/:id/datei':path.startsWith('/api/patient/rechnungen/')?'/api/patient/rechnungen/:id/pdf':path.startsWith('/patient/')?path:'other';}catch{path='invalid';}documentTargets[path]=(documentTargets[path]??0)+1;}
console.log(JSON.stringify({stats,documentTargets,notes:['mail_sent means recorded send acceptance, not mailbox delivery.','Contact events may cover multiple siblings; categories overlap.','No opening of activation links or account changes performed.']},null,2));

const [patients,messages,audits]=await Promise.all([
 all('patients','id,email,versicherter_email'),
 all('communication_messages','id,patient_id,recipient,subject,campaign_key,status,sent_at,delivered_at,metadata',q=>q.eq('channel','email').gte('created_at','2026-10-12T00:00:00Z')),
 all('audit_log','id,neue_werte,created_at',q=>q.eq('tabelle','email_send').gte('created_at','2026-10-12T00:00:00Z'))
]);
const mailStats={withAnyLedgerEmail:0,withActivationSubjectEmail:0,withActivationSubjectDelivered:0,withActivationAuditSent:0,withInvoiceSubjectEmail:0,ledgerRows:messages.length,emailAuditRows:audits.length,q3Accepted:0,clarificationAccepted:0,groups:{}};
for(const p of missing){
 const patient=patients.find(row=>row.id===p);const addresses=new Set([patient?.email,patient?.versicherter_email].filter(Boolean).map(s=>s.trim().toLowerCase()));
 const match=messages.filter(m=>m.patient_id===p||(Array.isArray(m.metadata?.patientIds)&&m.metadata.patientIds.includes(p))||addresses.has((m.recipient??'').trim().toLowerCase()));
 const activation=match.filter(m=>/aktivier|zugang|willkommen|activation|access/i.test(m.subject??''));
 const contactIds=new Set(contacts.filter(c=>c.patient_id===p).map(c=>c.contact_id));
 const hasLink=links.some(l=>contactIds.has(l.contact_id)&&!l.consumed_at&&Date.parse(l.expires_at)>now);
 const key=(hasLink?'valid_link':'no_valid_link')+'_'+(match.some(m=>m.status==='accepted')?'historical_mail_accepted':'no_historical_mail_evidence');
 mailStats.groups[key]=(mailStats.groups[key]??0)+1;
 mailStats.q3Accepted+=match.some(m=>m.campaign_key==='q3_2026_invoice_email'&&m.status==='accepted');
 mailStats.clarificationAccepted+=match.some(m=>m.campaign_key==='patient_portal_clarification_20261015'&&m.status==='accepted');
 mailStats.withAnyLedgerEmail+=match.length>0;mailStats.withActivationSubjectEmail+=activation.some(m=>m.sent_at);mailStats.withActivationSubjectDelivered+=activation.some(m=>m.delivered_at);mailStats.withInvoiceSubjectEmail+=match.some(m=>/rechnung|invoice/i.test(m.subject??''));
 mailStats.withActivationAuditSent+=audits.some(a=>addresses.has((a.neue_werte?.to??'').trim().toLowerCase())&&/aktivier|zugang|willkommen|activation|access/i.test(a.neue_werte?.subject??'')&&['sent','success'].includes(a.neue_werte?.status));
}
console.log(JSON.stringify({mailStats,limitation:'Subject/contact matching is an indication, not proof of an activation URL in the historical message or mailbox delivery.'},null,2));
if(process.argv.includes('--verify-private-pdfs')){
 let valid=0,missing=0,invalid=0;
 for(let n=0;n<docs.length;n+=6)await Promise.all(docs.slice(n,n+6).map(async d=>{
  const result=await db.storage.from('billing-documents').download(`${d.patient_id}/${d.id}.pdf`);
  if(result.error||!result.data){missing++;return;}
  if(await result.data.slice(0,5).text()==='%PDF-')valid++;else invalid++;
 }));
 console.log(JSON.stringify({privateStorageOnly:{checked:docs.length,valid,missing,invalid},patientSessionVerified:false}));
}
