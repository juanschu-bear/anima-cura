import {parseBirthDate,namedSubject} from './animahost-chat-identity';
import type {createServerClient} from '@/lib/db/supabase';
export type NamePatient={id:string;vorname:string;nachname:string;geburtsdatum?:string|null;geschlecht?:string|null;versicherter_vorname?:string|null;versicherter_nachname?:string|null;eb2_vorname?:string|null;eb2_nachname?:string|null};
const words=(value:string)=>value.toLocaleLowerCase('de').replace(/ß/g,'ss').replace(/ae/g,'a').replace(/oe/g,'o').replace(/ue/g,'u').normalize('NFD').replace(new RegExp('\\p{M}','gu'),'').match(new RegExp('\\p{L}+','gu'))??[];
const ordinary=new Set('hallo guten tag morgen abend danke viele grusse liebe herr frau ich mein meine sohn tochter kind termin montag dienstag mittwoch donnerstag freitag samstag sonntag mai juni juli'.split(' '));
/** Subject mentions (consent, relatives, children) are not sender declarations. */
export function senderNameText(message:string){return message.replace(/\b(?:mein(?:e[mnr]?)?|unser(?:e[mnr]?)?)\s+(?:Bruder|Mutter|Vater|Sohn|Tochter|Schwester|Kind|Mann|Frau|Partner(?:in)?|Enkel(?:in)?)\b[^.!?\n]*(?:[.!?]|$)/gi,' ');}
export function selfNameClaim(message:string){return /(?:mein Name ist|ich heiße|ich heisse|ich bin|hier ist)\s+([^.!?,\n]+)/i.exec(senderNameText(message))?.[1]??null;}
/** Name matching establishes a provisional conversational link, NEVER proof of identity. */
export function matchChatNames(message:string,patients:NamePatient[]){
 message=selfNameClaim(message)??senderNameText(message);
 const tokens=new Set(words(message));const standalone=words(message).length<=3;
 const hits=patients.flatMap(p=>{
  const variants=[[p.vorname,p.nachname,'patient'],[p.versicherter_vorname,p.versicherter_nachname,'parent'],[p.eb2_vorname,p.eb2_nachname,'parent']];
  const names=variants.flatMap(([first,last,role])=>{
   const f=words(first??'').filter(w=>!ordinary.has(w)),l=words(last??'').filter(w=>!ordinary.has(w));
   const given=f.filter(w=>tokens.has(w)),surname=l.filter(w=>tokens.has(w));
   const full=given.length&&surname.length;
   const explicitGiven=given.some(w=>standalone||new RegExp('(?:bin|heisse|hier|sohn|tochter|kind|fur|gruss|grusse|lg)\\s+(?:\\p{L}+\\s+){0,2}'+w+'(?:\\b|s\\b)','u').test(words(message).join(' ')));
   const explicitSurname=surname.some(w=>new RegExp('(?:herr|frau)\\s+'+w+'\\b').test(words(message).join(' ')));
   if(!full&&!explicitGiven&&!explicitSurname)return [];
   return [{score:full?3:1,matchedName:full?[first,last].filter(Boolean).join(' '):explicitSurname?String(last):String(first),role}];
  }).sort((a,b)=>b.score-a.score);
  return names.length?[{patient:p,...names[0]}]:[];
 });
 // A sender matching a patient directly outranks a shared parent name; never select an arbitrary sibling.
 const direct=hits.filter(h=>h.role==='patient');const pool=direct.length?direct:hits;const best=Math.max(0,...pool.map(h=>h.score));
 return pool.filter(h=>h.score===best);
}
export type ChatNameContext={status:'matched'|'ambiguous'|'unmatched';matchedName?:string;patientId?:string;question:string|null;source?:'chat';confirmed?:boolean;candidateIds?:string[]};
export async function resolveChatName(db:ReturnType<typeof createServerClient>,input:{tenant:string;chat:string;phone:string;message:string;readOnly?:boolean;candidateIds?:string[]}){
 const existing=await db.from('animahost_chat_identity_links').select('*').eq('tenant_id',input.tenant).eq('chat_jid',input.chat).eq('phone',input.phone);
 if(existing.error)throw Error('chat_identity_unavailable');
 const usable=existing.data.filter(r=>r.status!=='released');
 if(usable.length===1&&!namedSubject(input.message)&&!selfNameClaim(input.message)&&!/(?:grüße|gruss)/i.test(input.message)){const link=usable[0];const p=await db.from('patients').select('id,vorname,nachname,geburtsdatum,geschlecht').eq('id',link.patient_id).single();if(p.error)throw Error('chat_identity_unavailable');
  return {context:{status:'matched',matchedName:link.matched_name,patientId:link.patient_id,question:null,source:'chat',confirmed:link.status==='confirmed'} as ChatNameContext,patient:p.data};}
 const patients:NamePatient[]=[];
 for(let start=0;;start+=1000){const page=await db.from('patients').select('id,vorname,nachname,geburtsdatum,geschlecht,versicherter_vorname,versicherter_nachname,eb2_vorname,eb2_nachname').order('id').range(start,start+999);
  if(page.error)throw Error('name_match_unavailable');patients.push(...page.data);if(page.data.length<1000)break;}
 const released=new Set(existing.data.filter(r=>r.status==='released').map(r=>r.patient_id));
 const birth=parseBirthDate(input.message);
 const birthdayMatches=birth&&input.candidateIds?.length?patients.filter(p=>input.candidateIds!.includes(p.id)&&p.geburtsdatum===birth).map(patient=>({patient,matchedName:[patient.vorname,patient.nachname].join(' '),role:'patient',score:3})):null;
 const matches=(birthdayMatches??matchChatNames(input.message,patients)).filter(h=>!released.has(h.patient.id));
 if(matches.length!==1)return {context:{status:matches.length?'ambiguous':'unmatched',candidateIds:matches.map(h=>h.patient.id),question:matches.length?'Wie lautet das Geburtsdatum des Patienten?':'Unter welchem Namen sind Sie bei uns angemeldet?'} as ChatNameContext,patient:null};
 const match=matches[0];
 if(!input.readOnly){const saved=await db.from('animahost_chat_identity_links').upsert({tenant_id:input.tenant,chat_jid:input.chat,phone:input.phone,patient_id:match.patient.id,matched_name:match.matchedName},{onConflict:'tenant_id,chat_jid,phone,patient_id',ignoreDuplicates:true});if(saved.error)throw Error('chat_identity_store_failed');}
 return {context:{status:'matched',matchedName:match.matchedName,patientId:match.patient.id,question:null,source:'chat',confirmed:usable.some(link=>link.patient_id===match.patient.id&&link.status==='confirmed')} as ChatNameContext,patient:match.patient};
}
