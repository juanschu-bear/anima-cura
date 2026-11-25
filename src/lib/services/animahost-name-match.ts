import {parseBirthDate,namedSubject} from './animahost-chat-identity';
import type {createServerClient} from '@/lib/db/supabase';
export type NamePatient={id:string;vorname:string;nachname:string;geburtsdatum?:string|null;geschlecht?:string|null;versicherter_vorname?:string|null;versicherter_nachname?:string|null;eb2_vorname?:string|null;eb2_nachname?:string|null;versicherter_geburtsdatum?:string|null;recipients?:string[]};
const words=(value:string)=>value.toLocaleLowerCase('de').replace(/ß/g,'ss').replace(/ae/g,'a').replace(/oe/g,'o').replace(/ue/g,'u').normalize('NFD').replace(new RegExp('\\p{M}','gu'),'').match(new RegExp('\\p{L}+','gu'))??[];
const ordinary=new Set('hallo guten tag morgen abend danke viele grusse liebe herr frau ich mein meine sohn tochter kind termin montag dienstag mittwoch donnerstag freitag samstag sonntag mai juni juli'.split(' '));
/** Subject mentions (consent, relatives, children) are not sender declarations. */
export function senderNameText(message:string){return message.replace(/\b(?:mein(?:e[mnr]?)?|unser(?:e[mnr]?)?)\s+(?:Bruder|Mutter|Vater|Sohn|Tochter|Schwester|Kind|Mann|Frau|Partner(?:in)?|Enkel(?:in)?)\b[^.!?\n]*(?:[.!?]|$)/gi,' ');}
export function selfNameClaim(message:string){return /(?:mein Name ist|ich heiße|ich heisse|ich bin|hier ist)\s+([^.!?,\n]+)/i.exec(senderNameText(message))?.[1]??null;}
export function senderDeclaration(message:string){return selfNameClaim(message)??/(?:\b(?:lg|vg|mfg)\b|(?:freundlichen?|lieben?|vielen?|besten?)?\s*grü(?:ß|ss)(?:e|en)|gruss)[,\s]+([^.!?\n]+)\s*$/i.exec(senderNameText(message))?.[1]??null;}
/** Name matching establishes a provisional conversational link, NEVER proof of identity. */
export function matchChatNames(message:string,patients:NamePatient[]){
 const birth=parseBirthDate(message);
 message=senderDeclaration(message)??senderNameText(message);
 const tokens=new Set(words(message));
 const hits=patients.flatMap(p=>{
  const variants=[[p.vorname,p.nachname,'patient',p.geburtsdatum],[p.versicherter_vorname,p.versicherter_nachname,'parent',p.versicherter_geburtsdatum],[p.eb2_vorname,p.eb2_nachname,'parent',null]];
  const names=variants.flatMap(([first,last,role,birthday])=>{
   const f=words(first??'').filter(w=>!ordinary.has(w)),l=words(last??'').filter(w=>!ordinary.has(w));
   const surname=l.length>0&&l.every(w=>tokens.has(w));
   const full=surname&&f.some(w=>tokens.has(w));
   if(!full&&!(surname&&birth&&birthday===birth))return [];
   return [{score:3,matchedName:[first,last].filter(Boolean).join(' '),role}];
  }).sort((a,b)=>b.score-a.score);
  for(const name of p.recipients??[]){const parts=words(name);if(parts.length>=2&&parts.every(w=>tokens.has(w)))names.push({score:3,matchedName:name,role:'recipient'});}
  return names.length?[{patient:p,...names[0]}]:[];
 });
 // A sender matching a patient directly outranks a shared parent name; never select an arbitrary sibling.
 const direct=hits.filter(h=>h.role==='patient');const pool=direct.length?direct:hits;const best=Math.max(0,...pool.map(h=>h.score));
 return pool.filter(h=>h.score===best);
}
/** A child mentioned in a message is the subject, not necessarily the sender. */
export function subjectNameText(message:string):string|null{
 const name="[\\p{Lu}][\\p{L}’'-]*";
 const pattern=new RegExp(`(?:[Mm]ein(?:e[mnr]?)?|[Uu]nser(?:e[mnr]?)?)\\s+(?:Sohn|Tochter|Kind)\\s+(${name}(?:\\s+${name}){1,5})`,'u');
 return pattern.exec(message)?.[1]??null;
}
/** Partial compound names are candidates only; they never prove identity. */
export function matchSubjectNames(message:string,patients:NamePatient[]){
 const subject=subjectNameText(message);if(!subject)return [];
 const tokens=new Set(words(subject));const birth=/geb(?:oren|urtsdatum)?[.:\s]/i.test(message)?parseBirthDate(message):null;
 return patients.filter(p=>{
  const first=words(p.vorname).filter(w=>!ordinary.has(w)),last=words(p.nachname).filter(w=>!ordinary.has(w));
  return first.some(w=>tokens.has(w))&&last.some(w=>tokens.has(w))&&(!birth||p.geburtsdatum===birth);
 }).map(patient=>({patient,matchedName:[patient.vorname,patient.nachname].join(' '),role:'subject',exact:words(patient.nachname).every(w=>tokens.has(w))}));
}
export function subjectNameResolution(message:string,patients:NamePatient[],verifiedIds:string[]=[]){
 const matches=matchSubjectNames(message,patients);if(!matches.length)return null;
 const verified=matches.filter(m=>verifiedIds.includes(m.patient.id));
 const chosen=verified.length===1?verified[0]:matches.length===1&&matches[0].exact?matches[0]:null;
 if(chosen)return {context:{status:'matched',matchedName:chosen.matchedName,patientId:chosen.patient.id,role:'subject',source:verified.length===1?'phone':'chat',confirmed:verified.length===1,question:null} as ChatNameContext,patient:chosen.patient};
 const sameBirth=matches.length>1&&!!matches[0].patient.geburtsdatum&&matches.every(m=>m.patient.geburtsdatum===matches[0].patient.geburtsdatum);
 return {context:{status:'ambiguous',role:'subject',candidateIds:matches.map(m=>m.patient.id),possibleDuplicate:sameBirth,question:sameBirth?'Der Name ist vorhanden, aber mehrere passende Einträge lassen sich nicht sicher unterscheiden. Das Team muss die richtige Akte zuordnen.':parseBirthDate(message)?'Bitte nennen Sie den vollständigen Namen des Kindes.':'Wie lautet der vollständige Name und das Geburtsdatum Ihres Kindes?'} as ChatNameContext,patient:null};
}
export type ChatNameContext={status:'matched'|'ambiguous'|'unmatched';matchedName?:string;patientId?:string;question:string|null;source?:'chat'|'phone'|'linked_relative';role?:string;confirmed?:boolean;candidateIds?:string[];possibleDuplicate?:boolean};
const nameColumns='id,vorname,nachname,geburtsdatum,geschlecht,versicherter_vorname,versicherter_nachname,versicherter_geburtsdatum,eb2_vorname,eb2_nachname';
/** Read relations only for patients already connected to this trusted phone/chat. */
export async function linkedNamePatients(db:ReturnType<typeof createServerClient>,ids:string[]):Promise<NamePatient[]>{
 if(!ids.length)return [];
 const [people,plans,versions]=await Promise.all([
  db.from('patients').select(nameColumns).in('id',ids),
  db.from('behandlungsfall').select('patient_id,zahler_id').in('patient_id',ids).eq('status','aktiv'),
  db.from('billing_invoice_recipient_versions').select('patient_id,zahler_id,snapshot').in('patient_id',ids).eq('state','active'),
 ]);
 if(people.error||plans.error||versions.error)throw Error('linked_names_unavailable');
 const payerIds=Array.from(new Set([...plans.data,...versions.data].map(r=>r.zahler_id).filter(Boolean)));
 const payers=payerIds.length?await db.from('zahler').select('id,name').in('id',payerIds):{data:[],error:null};
 if(payers.error)throw Error('linked_names_unavailable');
 return people.data.map(p=>({...p,recipients:[...plans.data,...versions.data].filter(r=>r.patient_id===p.id).flatMap(r=>[payers.data?.find(z=>z.id===r.zahler_id)?.name,'snapshot' in r?(r.snapshot as {name?:string}|null)?.name:null]).filter((n):n is string=>typeof n==='string'&&!!n.trim())}));
}
export function linkedSenderMatch(message:string,patients:NamePatient[],verifiedIds:string[]){
 const matches=patients.flatMap(patient=>matchChatNames(message,[patient]));
 if(!matches.length)return null;
 if(matches.length!==1)return {context:{status:'ambiguous',candidateIds:matches.map(m=>m.patient.id),question:'Um welches Ihrer Kinder geht es?'} as ChatNameContext,patient:null};
 const match=matches[0];
 return {context:{status:'matched',matchedName:match.matchedName,patientId:match.patient.id,role:match.role,source:match.role==='patient'?'phone':'linked_relative',confirmed:verifiedIds.includes(match.patient.id),question:null} as ChatNameContext,patient:match.patient};
}
export async function resolveChatName(db:ReturnType<typeof createServerClient>,input:{tenant:string;chat:string;phone:string;message:string;readOnly?:boolean;candidateIds?:string[];verifiedIds?:string[]}){
 const existing=await db.from('animahost_chat_identity_links').select('*').eq('tenant_id',input.tenant).eq('chat_jid',input.chat).eq('phone',input.phone);
 if(existing.error)throw Error('chat_identity_unavailable');
 const usable=existing.data.filter(r=>r.status!=='released');
 if(usable.length===1&&!namedSubject(input.message)&&!senderDeclaration(input.message)){const link=usable[0];const p=await db.from('patients').select(nameColumns).eq('id',link.patient_id).single();if(p.error)throw Error('chat_identity_unavailable');
  if(link.status==='confirmed'||matchChatNames(link.matched_name,[p.data]).length===1)return {context:{status:'matched',matchedName:link.status==='confirmed'?[p.data.vorname,p.data.nachname].join(' '):link.matched_name,patientId:link.patient_id,question:null,source:'chat',confirmed:link.status==='confirmed'} as ChatNameContext,patient:p.data};}
 const patients:NamePatient[]=[];
 for(let start=0;;start+=1000){const page=await db.from('patients').select(nameColumns).order('id').range(start,start+999);
  if(page.error)throw Error('name_match_unavailable');patients.push(...page.data);if(page.data.length<1000)break;}
 const released=new Set(existing.data.filter(r=>r.status==='released').map(r=>r.patient_id));
 const subject=subjectNameResolution(input.message,patients.filter(p=>!released.has(p.id)),input.verifiedIds);
 if(subject)return subject;
 const matches=matchChatNames(input.message,patients).filter(h=>!released.has(h.patient.id));
 if(matches.length!==1)return {context:{status:matches.length?'ambiguous':'unmatched',candidateIds:matches.map(h=>h.patient.id),question:matches.length?'Wie lautet das Geburtsdatum des Patienten?':'Unter welchem Namen sind Sie bei uns angemeldet?'} as ChatNameContext,patient:null};
 const match=matches[0];
 if(!input.readOnly){const saved=await db.from('animahost_chat_identity_links').upsert({tenant_id:input.tenant,chat_jid:input.chat,phone:input.phone,patient_id:match.patient.id,matched_name:match.matchedName},{onConflict:'tenant_id,chat_jid,phone,patient_id',ignoreDuplicates:true});if(saved.error)throw Error('chat_identity_store_failed');}
 return {context:{status:'matched',matchedName:match.matchedName,patientId:match.patient.id,question:null,source:'chat',confirmed:usable.some(link=>link.patient_id===match.patient.id&&link.status==='confirmed')} as ChatNameContext,patient:match.patient};
}
