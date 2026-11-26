import {parseBirthDate,namedSubject} from './animahost-chat-identity';
import type {createServerClient} from '@/lib/db/supabase';
export type NamePatient={id:string;vorname:string;nachname:string;geburtsdatum?:string|null;geschlecht?:string|null;versicherter_vorname?:string|null;versicherter_nachname?:string|null;eb2_vorname?:string|null;eb2_nachname?:string|null;versicherter_geburtsdatum?:string|null;recipients?:string[]};
const words=(value:string):string[]=>value.toLocaleLowerCase('de').replace(/ß/g,'ss').replace(/ae/g,'a').replace(/oe/g,'o').replace(/ue/g,'u').normalize('NFD').replace(new RegExp('\\p{M}','gu'),'').match(new RegExp('\\p{L}+','gu'))??[];
const ordinary=new Set('hallo guten tag morgen abend danke viele grusse liebe herr frau ich mein meine sohn tochter kind termin montag dienstag mittwoch donnerstag freitag samstag sonntag mai juni juli'.split(' '));
const nameParticles=new Set('de del da di dos van von der den la le'.split(' '));
const surnameWords=(value:string)=>{const parts=words(value);return parts.length>1?parts.filter(w=>!nameParticles.has(w)):parts;};
/** Subject mentions (consent, relatives, children) are not sender declarations. */
export function senderNameText(message:string){return message.replace(/\b(?:mein(?:e[mnr]?)?|unser(?:e[mnr]?)?)\s+(?:Bruder|Mutter|Vater|Sohn|Tochter|Schwester|Kind|Mann|Frau|Partner(?:in)?|Enkel(?:in)?)\b[^.!?\n]*(?:[.!?]|$)/gi,' ');}
export function selfNameClaim(message:string){
 const claim=/(?:mein Name ist|ich heiße|ich heisse|ich bin|hier ist)\s+([^.!?,\n]+)/i.exec(senderNameText(message))?.[1]?.trim();
 return claim&&!/^(?:(?:der|die|das|ein|eine)\s+)?(?:Mama|Papa|Mutter|Vater|Elternteil|Oma|Opa)\b/i.test(claim)?claim:null;
}
export function senderDeclaration(message:string){return selfNameClaim(message)??/(?:\b(?:lg|vg|mfg)\b|(?:freundlichen?|lieben?|vielen?|besten?)?\s*grü(?:ß|ss)(?:e|en)|gruss)[,\s]+([^.!?\n]+)\s*$/i.exec(senderNameText(message))?.[1]??null;}
/** Name matching establishes a provisional conversational link, NEVER proof of identity. */
export function matchChatNames(message:string,patients:NamePatient[]){
 const birth=parseBirthDate(message);
 message=senderDeclaration(message)??senderNameText(message);
 const tokens=new Set(words(message));
 const hits=patients.flatMap(p=>{
  const variants=[[p.vorname,p.nachname,'patient',p.geburtsdatum],[p.versicherter_vorname,p.versicherter_nachname,'parent',p.versicherter_geburtsdatum],[p.eb2_vorname,p.eb2_nachname,'parent',null]];
  const names=variants.flatMap(([first,last,role,birthday])=>{
   const f=words(first??'').filter(w=>!ordinary.has(w)),l=surnameWords(last??'').filter(w=>!ordinary.has(w));
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
 const name="[\\p{Lu}][\\p{L}’'‑-]*";
 const particle='(?:de|del|da|di|dos|van|von|der|den|la|le)';
 const parent=new RegExp(`(?:[Mm]ama|[Pp]apa|[Mm]utter|[Vv]ater|[Ee]lternteil|[Oo]ma|[Oo]pa)\\s+von\\s+((?:${particle}\\s+)*${name}(?:(?:\\s+|,\\s*)(?:${name}|${particle})){0,7})`,'u').exec(message);
 if(parent)return parent[1];
 const pattern=new RegExp(`(?:[Mm]ein(?:e[mnr]?)?|[Uu]nser(?:e[mnr]?)?)\\s+(Sohn|Tochter|Kind|Enkel|Enkelin|Mutter|Vater|Bruder|Schwester|Partner|Partnerin)\\s*:?\\s*((?:${particle}\\s+)*${name}(?:(?:\\s+|,\\s*)(?:${name}|${particle})){1,7})`,'u');
 const match=pattern.exec(message);if(!match)return null;
 const child=/^(?:Sohn|Tochter|Kind|Enkel|Enkelin)$/.test(match[1]);
 // A brother mentioned as an authorized caller is not the patient concerned.
 if(!child&&!/(?:Termin|Rechnung|Behandlung|Unterlagen|Bescheinigung)[^.!?]{0,60}(?:für|von)\s*$/i.test(message.slice(0,match.index)))return null;
 return match[2];
}
function oneNameEdit(a:string,b:string){
 if(Math.min(a.length,b.length)<5||Math.abs(a.length-b.length)>1)return false;
 if(a.length===b.length){const diffs=Array.from(a).flatMap((c,i)=>c===b[i]?[]:[i]);return diffs.length===1||diffs.length===2&&diffs[1]===diffs[0]+1&&a[diffs[0]]===b[diffs[1]]&&a[diffs[1]]===b[diffs[0]];}
 const [short,long]=a.length<b.length?[a,b]:[b,a];let i=0,j=0,edits=0;
 while(i<short.length&&j<long.length){if(short[i]===long[j]){i++;j++;}else{edits++;j++;if(edits>1)return false;}}
 return true;
}
/** Carry a named subject through a short answer, never across an explicit subject change or an old/future turn. */
export function identityMessageForTurn(message:string,history:readonly {direction:string;text:string;at:string}[],receivedAt:string){
 if(subjectNameText(message)||senderDeclaration(message)||namedSubject(message)||message.length>180||/anderes Anliegen|für mich|meine? (?:Mutter|Vater|Schwester|Bruder|Tochter|Sohn|Kind)|neues Thema/i.test(message))return message;
 const now=Date.parse(receivedAt);
 for(const turn of history.filter(h=>h.direction==='incoming').slice(-6).reverse()){
  if(Date.parse(turn.at)>now||now-Date.parse(turn.at)>86400000)continue;
  const subject=subjectNameText(turn.text);if(subject)return `Mein Kind ${subject}. ${message}`;
  if(senderDeclaration(turn.text)||namedSubject(turn.text)||/für mich|anderes Anliegen|neues Thema/i.test(turn.text))break;
 }
 return message;
}
/** Partial compound names are candidates only; they never prove identity. */
export function matchSubjectNames(message:string,patients:NamePatient[]){
 const subject=subjectNameText(message);if(!subject)return [];
 const tokens=new Set(words(subject));const birthday=/\b(?:geboren(?: am)?|geb(?:urtsdatum)?[.:]?)\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})/i.exec(message)?.[1];const birth=birthday?parseBirthDate(birthday):null;
 return patients.flatMap(patient=>{
  const first=words(patient.vorname).filter(w=>!ordinary.has(w)),last=surnameWords(patient.nachname).filter(w=>!ordinary.has(w));
  const exactFirst=first.some(w=>tokens.has(w)),exactLast=last.some(w=>tokens.has(w));
  const approximate=(parts:string[])=>parts.some(w=>Array.from(tokens).some(t=>oneNameEdit(w,t)));
  const spellingExact=exactFirst&&exactLast;
  if((!spellingExact&&!(exactFirst&&approximate(last)||exactLast&&approximate(first)))||birth&&patient.geburtsdatum!==birth)return [];
  return [{patient,matchedName:[patient.vorname,patient.nachname].join(' '),role:'subject',spellingExact,exact:spellingExact&&last.every(w=>tokens.has(w))}];
 });
}
export function subjectNameResolution(message:string,patients:NamePatient[],verifiedIds:string[]=[]){
 let matches=matchSubjectNames(message,patients);
 const subject=subjectNameText(message),parts=subject?words(subject):[];
 if(!matches.length&&parts.length===1){matches=patients.filter(p=>verifiedIds.includes(p.id)&&words(p.vorname).includes(parts[0])).map(patient=>({patient,matchedName:[patient.vorname,patient.nachname].join(' '),role:'subject',spellingExact:true,exact:false}));}
 if(!matches.length)return null;
 const verified=matches.filter(m=>verifiedIds.includes(m.patient.id)&&m.spellingExact);
 const chosen=verified.length===1?verified[0]:matches.length===1&&matches[0].exact?matches[0]:null;
 if(chosen)return {context:{status:'matched',matchedName:chosen.matchedName,patientId:chosen.patient.id,role:'subject',source:verified.length===1?'phone':'chat',confirmed:verified.length===1,question:null} as ChatNameContext,patient:chosen.patient};
 const sameBirth=matches.length>1&&!!matches[0].patient.geburtsdatum&&matches.every(m=>m.patient.geburtsdatum===matches[0].patient.geburtsdatum);
 return {context:{status:'ambiguous',role:'subject',candidateIds:matches.map(m=>m.patient.id),possibleDuplicate:sameBirth,question:sameBirth?'Der Name ist vorhanden, aber mehrere passende Einträge lassen sich nicht sicher unterscheiden. Das Team muss die richtige Akte zuordnen.':parseBirthDate(message)?'Bitte nennen Sie den vollständigen Namen des Kindes.':subjectNameText(message)&&words(subjectNameText(message)!).length>=2?'Wie lautet das Geburtsdatum Ihres Kindes?':'Wie lautet der vollständige Name Ihres Kindes?'} as ChatNameContext,patient:null};
}
export type ChatNameContext={status:'matched'|'ambiguous'|'unmatched';matchedName?:string;patientId?:string;question:string|null;senderName?:string;senderRole?:'parent';source?:'chat'|'phone'|'linked_relative';role?:string;confirmed?:boolean;candidateIds?:string[];possibleDuplicate?:boolean};
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
 if(!matches.length){
  const claim=senderDeclaration(input.message);
  const candidates=claim?matchSubjectNames('Mein Kind '+claim,patients.filter(p=>!released.has(p.id))):[];
  if(candidates.length)return {context:{status:'ambiguous',candidateIds:candidates.map(m=>m.patient.id),question:'Bitte bestätigen Sie die vollständige Schreibweise Ihres Namens und Ihr Geburtsdatum.'} as ChatNameContext,patient:null};
 }
 if(matches.length!==1)return {context:{status:matches.length?'ambiguous':'unmatched',candidateIds:matches.map(h=>h.patient.id),question:matches.length?'Wie lautet das Geburtsdatum des Patienten?':'Unter welchem Namen sind Sie bei uns angemeldet?'} as ChatNameContext,patient:null};
 const match=matches[0];
 if(!input.readOnly){const saved=await db.from('animahost_chat_identity_links').upsert({tenant_id:input.tenant,chat_jid:input.chat,phone:input.phone,patient_id:match.patient.id,matched_name:match.matchedName},{onConflict:'tenant_id,chat_jid,phone,patient_id',ignoreDuplicates:true});if(saved.error)throw Error('chat_identity_store_failed');}
 return {context:{status:'matched',matchedName:match.matchedName,patientId:match.patient.id,question:null,source:'chat',confirmed:usable.some(link=>link.patient_id===match.patient.id&&link.status==='confirmed')} as ChatNameContext,patient:match.patient};
}
/** A child's surname must not silently become the parent's salutation. */
export function removeInferredParentSalutation(text:string,message:string,patient:NamePatient|undefined){
 if(!patient||!/(?:mein|unser)(?:e[mnr]?)?\s+(?:Sohn|Tochter|Kind|Enkel|Enkelin)\b/i.test(message))return {text,removed:[] as string[]};
 const declaration=senderDeclaration(message),surname=words(patient.nachname);
 if(declaration&&surname.every(w=>new Set<string>(words(declaration)).has(w)))return {text,removed:[] as string[]};
 const escaped=patient.nachname.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`(?:,?\\s+)?\\b(?:Frau|Herr)\\s+${escaped}(?=[,!.?\\s]|$)`,'gi');
 const removed=Array.from(text.matchAll(pattern),m=>m[0]);return {text:removed.length?text.replace(pattern,'').replace(/^[, \t]+/,''):text,removed};
}
