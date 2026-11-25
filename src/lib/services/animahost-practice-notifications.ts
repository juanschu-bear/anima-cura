import {createHash} from 'node:crypto';
import type {createServerClient} from '@/lib/db/supabase';
import {t} from '@/lib/i18n';
import {hostBellBundle,hostBellPrefix,hostBellText,validChat,type HostBellBundle,type HostBellItem} from '@/lib/animahost-notification-view';
import {phonePatients} from './animahost-chat-identity';
import type {ChatDetails} from './animahost-quality-workflows';
import type {WhatsAppDecision} from './animahost-whatsapp';
import type {ConversationHistory} from './animahost-whatsapp-conversation';
type Db=ReturnType<typeof createServerClient>;
type Row={id:string;body:string;source_key:string};
export interface BellStore{
 duplicate(prefix:string,event:string,role:string):Promise<boolean>;
 active(key:string,role:string):Promise<Row|null>;
 insert(key:string,role:string,bundle:HostBellBundle):Promise<boolean>;
 replace(row:Row,bundle:HostBellBundle):Promise<boolean>;
 retire(row:Row):Promise<boolean>;
}
/** Unique active keys plus compare-and-swap prevent lost cases across concurrent serverless requests. */
export async function bundleActNotification(store:BellStore,input:{tenant:string;chat:string;messageId:string;teamKind?:string;person:string;concern:string;done:string},now=new Date()){
 if(input.teamKind!=='act')return;
 if(!validChat(input.chat))throw Error('invalid_chat');
 const event=createHash('sha256').update(input.messageId).digest('hex');
 const prefix=`${hostBellPrefix}${input.tenant}:${input.chat}:`;
 const item:HostBellItem={id:event,person:input.person,concern:input.concern,done:input.done};
 for(const role of ['admin','verwaltung']){
  if(await store.duplicate(prefix,event,role))continue;
  let saved=false;
  for(let attempt=0;attempt<12;attempt++){
   const row=await store.active(prefix+'active',role);
   const previous=row?hostBellBundle(row.body):null;
   if(previous?.items.some(i=>i.id===event)){saved=true;break;}
   if(row&&(!previous||now.getTime()-Date.parse(previous.startedAt)>=30*60_000)){
    if(!await store.retire(row))continue;
    continue;
   }
   const bundle:HostBellBundle=previous?{...previous,items:[...previous.items,item]}:{type:'animahost_act_v1',chat:input.chat,startedAt:now.toISOString(),items:[item]};
   if(row?await store.replace(row,bundle):await store.insert(prefix+'active',role,bundle)){saved=true;break;}
  }
  if(!saved)throw Error('host_notification_concurrent_update');
 }
}
export function notificationStore(db:Db):BellStore{
 const payload=(bundle:HostBellBundle)=>({kind:'antwort',title:hostBellText(bundle).title,body:JSON.stringify(bundle),link:'/nachrichten?chat='+encodeURIComponent(bundle.chat)});
 const checked=(result:any)=>{if(result.error)throw Error('host_notification_store_failed');return result.data;};
 return {
  async duplicate(prefix,event,role){return Boolean(checked(await db.from('practice_notifications').select('id').eq('recipient_role',role).like('source_key',prefix+'%').like('body','%"id":"'+event+'"%').limit(1).maybeSingle()));},
  async active(key,role){return checked(await db.from('practice_notifications').select('id,body,source_key').eq('source_key',key).eq('recipient_role',role).maybeSingle());},
  async insert(key,role,bundle){const result=await db.from('practice_notifications').insert({...payload(bundle),source_key:key,recipient_role:role}).select('id').maybeSingle();if(result.error?.code==='23505')return false;return Boolean(checked(result));},
  async replace(row,bundle){const result=checked(await db.from('practice_notifications').update({...payload(bundle),created_at:new Date().toISOString()}).eq('id',row.id).eq('body',row.body).eq('source_key',row.source_key).select('id').maybeSingle());if(!result)return false;
   // A newly appended action case must not disappear behind an earlier read receipt.
   checked(await db.from('practice_notification_reads').delete().eq('notification_id',row.id));return true;},
  async retire(row){return Boolean(checked(await db.from('practice_notifications').update({source_key:row.source_key.replace(/active$/,row.id)}).eq('id',row.id).eq('body',row.body).eq('source_key',row.source_key).select('id').maybeSingle()));},
 };
}
const words=(value:string)=>value.toLocaleLowerCase('de').normalize('NFKC').replace(new RegExp('[^\\p{L}\\p{N}]+','gu'),' ').trim();
export function notificationPerson(candidates:{id:string;vorname:string;nachname:string}[],input:{patientId?:string|null;text?:string|null;phone?:string|null;from:string}){
 const text=' '+words(input.text??'')+' ';
 const explicit=candidates.filter(p=>[p.vorname+' '+p.nachname,p.nachname+' '+p.vorname].some(name=>text.includes(' '+words(name)+' ')));
 const person=explicit.length===1?explicit[0]:candidates.find(p=>p.id===input.patientId)??(candidates.length===1?candidates[0]:null);
 if(person)return [person.nachname,person.vorname].filter(Boolean).join(', ');
 const phone=input.phone??(input.from.endsWith('@s.whatsapp.net')?input.from.split('@')[0]:null);
 return phone?'+'+phone.replace(/^\+/,''):t('animahost.bell.unknown','de');
}
export function notificationContent(decision:WhatsAppDecision,incoming:string,history:ConversationHistory=[]){
 const text=decision.rule+' '+incoming+' '+decision.text;
 const concern=/verspät|stau|late_arrival|Minuten? später|Straßen.{0,30}voll/i.test(text)?'late':/verschieb|verleg|umbuch/i.test(text)?'reschedule':/absag|stornier/i.test(text)?'cancel':/vollmacht|bevollmächtig|bruder|herausgeben/i.test(text)?'permission':/rechnung|abbuch|zahlung|erstatt/i.test(text)?'invoice':/termin/i.test(text)?'appointment':/schmerz|draht|bracket|spange|schiene/i.test(text)?'treatment':'clarify';
 // Preparation is not delivery. Only confirmed historical host messages justify 'sent'.
 const sentLink=history.some(h=>h.direction==='outgoing'&&h.source==='animahost'&&/https?:\/\/[^\s]*doctolib/i.test(h.text));
 const done=/https?:\/\/[^\s]*doctolib/i.test(decision.text)?(sentLink?'link_sent':'link_prepared'):decision.text.includes('?')?'question_prepared':decision.text.trim()?'reply_prepared':'review_requested';
 return {concern,done};
}
export async function notifyHostPractice(db:Db,input:{tenantId:string;messageId:string;from:string;phone?:string|null;text?:string|null;history?:ConversationHistory},decision:WhatsAppDecision,details?:ChatDetails|null){
 if(details?.teamKind!=='act')return;
 const phone=input.phone??(input.from.endsWith('@s.whatsapp.net')?input.from.split('@')[0]:null);
 const candidates=phone?await phonePatients(db,phone).catch(()=>null)??[]:[];
 if(details.patientId&&!candidates.some(p=>p.id===details.patientId)){
  const result=await db.from('patients').select('id,vorname,nachname,geburtsdatum,geschlecht').eq('id',details.patientId).maybeSingle();
  if(!result.error&&result.data)candidates.push(result.data);
 }
 const person=notificationPerson(candidates,{...input,patientId:details.patientId});
 await bundleActNotification(notificationStore(db),{tenant:input.tenantId,chat:input.from,messageId:input.messageId,teamKind:details.teamKind,person,...notificationContent(decision,input.text??'',input.history)});
}
