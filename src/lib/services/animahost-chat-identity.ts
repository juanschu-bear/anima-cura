import type {createServerClient} from '@/lib/db/supabase';
import {normalizeContactPhone} from './animahost-contact-notices';

type Db=ReturnType<typeof createServerClient>;
export type PhonePatient={id:string;vorname:string;nachname:string;geburtsdatum:string|null;geschlecht:string|null};
export type SubjectTask='appointment'|'late_arrival'|'attendance_certificate'|'missing_invoice'|'financial';
export type ChatContext={
 journey?:{kind:'appointment'|'portal';step:number;at:string};
 // `anyPatient`: Die Nachricht nannte ein Kind, das nicht an der Nummer hängt. Gesucht wird dann wie bei einer unbekannten Nummer in allen Akten.
 challenge?:{kind:'missing_invoice'|'financial';patientId?:string;question:string;attempts:number;at:string;anyPatient?:boolean};
 subject?:{kind:SubjectTask;question:string;at:string;date?:string|null};
};
export function phoneLabels(patients:PhonePatient[]){
 return patients.map(p=>({patientId:p.id,firstName:p.vorname,lastName:p.nachname}));
}
export async function phonePatients(db:Db,phone:string):Promise<PhonePatient[]|null>{
 const normalized=normalizeContactPhone(phone);
 if(!normalized)return null;
 const result=await db.rpc('animahost_phone_patients',{p_phone:normalized});
 if(result.error?.code==='PGRST202'||result.error?.code==='42883')return null;
 if(result.error||!Array.isArray(result.data)||result.data.length>100)throw Error('phone_match_unavailable');
 return result.data as PhonePatient[];
}

export function patientIsMinor(birth:string|null,date:string){
 if(!birth)return null;
 const adult=new Date(`${birth}T12:00:00Z`);
 if(!Number.isFinite(adult.getTime()))return null;
 adult.setUTCFullYear(adult.getUTCFullYear()+18);
 return adult.toISOString().slice(0,10)>date;
}

const normalized=(value:string)=>value.normalize('NFKC').trim().toLocaleLowerCase('de-DE')
 .replace(/[^a-zà-ÿ0-9]+/g,' ').trim();
/** Die Nachricht nennt diesen Patienten beim Vornamen, auch als „Emmas Termin“. Bei mehreren Vornamen reicht einer. */
export function mentionsPatient(text:string,patient:PhonePatient){
 const words=new Set(normalized(text).split(' '));
 return normalized(patient.vorname).split(' ').some(name=>name.length>1&&(words.has(name)||words.has(`${name}s`)));
}
// Wörter, die an der Stelle eines Vornamens stehen können, aber keiner sind („Ihres Termins“, „Dienstags Termin“, „des Sohnes Termin“).
const NOT_A_NAME=new Set(['ihr','ihre','ihren','unser','unsere','unseren','mein','meine','meinen','dein','deine','deinen','sein','seine','seinen','ein','eine','einen','kein','keine','keinen',
 'diese','dieser','diesen','jede','jeden','welche','alle','manche','solche','beide','andere','letzte','nächste','neue','weitere','erste','zweite',
 'montag','dienstag','mittwoch','donnerstag','freitag','samstag','sonntag','heute','morgen','gestern','abend','mittag','vormittag','nachmittag','anfang','ende',
 'frau','herr','doktor','praxis','doctolib','anima','whatsapp','kind','kinde','sohn','sohne','tochter','bruder','schwester','mann','manne','junge','eltern','familie','patient','patientin']);
const L='A-Za-zÄÖÜäöüßÀ-ÿ';
const SUBJECT_THING=new RegExp(`^(?:(?:nächste|neue|letzte|erste|zweite)[rnms]?\\s+)?(?:termine?s?|rechnung(?:en)?|spange|zahnspange|schienen?|behandlung|behandlungsplan|bescheinigung|kontrolle|retainer|brackets?|röntgenbild(?:er)?|unterlagen|akte|abholung|kostenplan)(?![${L}])`,'i');
/**
 * Vorname, den die Nachricht ausdrücklich als betroffene Person nennt: „Fabians Termin“ oder „mein Sohn Fabian“ (22.11.2026).
 * Nur eindeutige sprachliche Personenbezüge zählen; sonst bleibt die Zuordnung offen.
 */
export function namedSubject(text:string):string|null{
 const name=(value:string|undefined)=>value&&!NOT_A_NAME.has(value.toLocaleLowerCase('de-DE'))&&!SUBJECT_THING.test(value)&&!['Fragen','Hilfe','Antwort','Rückmeldung','Informationen','Rechnungen','Termin'].includes(value)?value:null;
 const genitive=new RegExp(`(?:^|[^${L}])([A-ZÄÖÜ][a-zäöüßà-ÿ]{2,})s\\s+`,'g');
 for(let hit=genitive.exec(text);hit;hit=genitive.exec(text)){
  if(SUBJECT_THING.test(text.slice(genitive.lastIndex))&&name(hit[1]))return hit[1];
 }
 const family=new RegExp(`(?:^|[^${L}])(?:[Mm]ein|[Uu]nser)(?:e[mnr]?)?\\s+(?:Sohn|Tochter|Kind|Bruder|Schwester|Enkel|Enkelin)\\s+([A-ZÄÖÜ][a-zäöüßà-ÿ]{2,})(?![${L}])`).exec(text);
 if(name(family?.[1]))return name(family?.[1]);
 const explicit=new RegExp(`(?:für|von|um)\\s+([A-ZÄÖÜ][a-zäöüßà-ÿ]{2,})(?![${L}])`).exec(text);
 if(name(explicit?.[1]))return name(explicit?.[1]);
 const active=new RegExp(`(?:^|[.!?]\\s+)([A-ZÄÖÜ][a-zäöüßà-ÿ]{2,})(?:\\s*:\\s*(?:Termin|Rechnung)|\\s+(?:hat|braucht|benötigt)\\s+(?:einen?|den|seinen?|ihren?)\\s+(?:Termin|Rechnung))`).exec(text);
 return name(active?.[1]);
}
/**
 * Wem gilt die Nachricht? Genau 1 genannter Patient der Nummer: dieser. Niemand genannt und nur 1 Patient an der Nummer: dieser,
 * außer die Nachricht nennt ausdrücklich eine andere Person. Dann wird nichts angenommen, statt über das falsche Kind zu antworten.
 */
export function selectPhonePatient(list:PhonePatient[],text:string){
 const subject=namedSubject(text);
 if(subject){const matches=list.filter(p=>mentionsPatient(subject,p));return matches.length===1?matches[0]:null;}
 const line=` ${normalized(text)} `;
 const mentioned=list.filter(p=>mentionsPatient(text,p)||line.includes(` ${normalized(`${p.vorname} ${p.nachname}`)} `));
 if(mentioned.length===1)return mentioned[0];
 if(mentioned.length>1||list.length!==1)return null;
 return namedSubject(text)?null:list[0];
}

export function parseBirthDate(text:string){
 const local=/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/.exec(text);
 const iso=/\b\d{4}-\d{2}-\d{2}\b/.exec(text);
 const day=iso?.[0]??(local?`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`:null);
 if(!day)return null;
 const time=Date.parse(`${day}T12:00:00Z`);
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===day?day:null;
}

export function maskBirthDates(text:string){
 return text.replace(/\b(?:\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})\b/g,'[Datum]');
}

/**
 * Proof applies to this conversation only. The supplied candidates must come
 * directly from the trusted phone lookup, before adding staff or name matches.
 */
export function conversationPhoneProof(phones:PhonePatient[],message:string,history:readonly {direction:string;text:string;at:string}[],receivedAt:string){
 const at=Date.parse(receivedAt);
 const candidatesFor=(text:string)=>{
  const dates=Array.from(text.matchAll(/\b(?:\d{1,2}[./]\d{1,2}[./]\d{4}|\d{4}-\d{2}-\d{2})\b/g),match=>parseBirthDate(match[0]));
  if(dates.length!==1||!dates[0])return [];
  const candidateText=normalized(maskBirthDates(text).replace('[Datum]',''));
  const words=new Set(candidateText.split(' '));
  return phones.filter(p=>{
   const surname=normalized(p.nachname??'').split(' ').filter(Boolean);
   const firstname=normalized(p.vorname??'').split(' ').filter(Boolean);
   return p.geburtsdatum===dates[0]&&surname.length>0&&surname.every(name=>words.has(name))&&firstname.some(name=>words.has(name));
  });
 };
 const present=candidatesFor(message);
 if(present.length)return present.length===1&&isCurrentSubject(present[0])?present[0]:null;
 // An explicit new birth-date claim must stand on its own.
 if(parseBirthDate(message)&&(/\b(?:geb(?:oren|urtsdatum)?\.?|birthday|date of birth)\b/i.test(message)||phones.some(p=>mentionsPatient(message,p))))return null;
 const proofs=new Map(history.filter(turn=>turn.direction==='incoming'&&Date.parse(turn.at)<=at&&at-Date.parse(turn.at)<=86_400_000).slice(-10)
  .flatMap(turn=>{const matched=candidatesFor(turn.text);return matched.length===1?[[matched[0].id,matched[0]] as const]:[];}));
 const eligible=Array.from(proofs.values()).filter(isCurrentSubject);
 return eligible.length===1?eligible[0]:null;

 function isCurrentSubject(patient:PhonePatient){
  const current=selectPhonePatient(phones,message);
  if(current)return current.id===patient.id;
  if(namedSubject(message))return false;
  const mentioned=phones.filter(p=>mentionsPatient(message,p));
  return !mentioned.length;
 }
}

export async function identifyByBirthDate(db:Db,text:string,allowed:PhonePatient[],boundId?:string){
 const birthday=parseBirthDate(text);
 if(!birthday)return null;
 if(allowed.length||boundId){
  const matches=allowed.filter(patient=>patient.geburtsdatum===birthday&&(!boundId||patient.id===boundId));
  return selectPhonePatient(matches,text);
 }
 const remainder=maskBirthDates(text).replace('[Datum]','').trim();
 const patientNumber=/^(?:patientennummer\s*[:#]?\s*)?(\d{4,14})$/i.exec(remainder.replace(/[,;.]$/,''))?.[1];
 const named=normalized(remainder);
 if(!patientNumber&&named.split(' ').length<2)return null;
 const rows=await db.from('patients').select('id,vorname,nachname,geburtsdatum,geschlecht,ivoris_nummer')
  .eq('geburtsdatum',birthday).limit(101);
 if(rows.error||rows.data.length>100)return null;
 // Patienten schreiben selten nur den Namen („Mein Sohn Max Muster, geboren am …“). Es zählt, dass der Nachname vollständig und
 // mindestens 1 Vorname in der Nachricht stehen (bei „Noah Elias“ reicht „Noah“). Das Geburtsdatum hat die Auswahl schon eingegrenzt,
 // und nur 1 eindeutiger Treffer gilt: Zwillinge mit beiden Namen in der Nachricht bleiben offen.
 const words=new Set(named.split(' '));
 const parts=(value:string|null)=>normalized(value??'').split(' ').filter(Boolean);
 const matches=rows.data.filter(p=>patientNumber?String(p.ivoris_nummer??'').replace(/^0+/,'')===patientNumber.replace(/^0+/,''):
  parts(p.nachname).length>0&&parts(p.nachname).every(part=>words.has(part))&&parts(p.vorname).some(part=>words.has(part)));
 return matches.length===1?matches[0]:null;
}

export function explicitlyOffersDu(text:string){
 return !/\bnicht\b/i.test(text)&&/(?:kannst|darfst|dürfen|können|kann|darf).{0,20}(?:mich|uns|wir).{0,20}duz|(?:bitte|gerne|gern).{0,20}(?:duzen|beim du)|(?:sag|sage).{0,18}\bdu zu mir/i.test(text);
}

const verb:Record<string,string>={finden:'findest',können:'kannst',müssen:'musst',haben:'hast',sind:'bist',
 bekommen:'bekommst',erhalten:'erhältst',möchten:'möchtest',sollen:'sollst',dürfen:'darfst',sehen:'siehst',
 lesen:'liest',brauchen:'brauchst',wählen:'wählst',schreiben:'schreibst',melden:'meldest',laden:'lädst',wissen:'weißt',
 erreichen:'erreichst',rufen:'rufst',kommen:'kommst'};

export function useDu(text:string){
 const change=(word:string)=>verb[word.toLowerCase()]??word.toLowerCase().slice(0,-2)+'st';
 return text.replace(/\b(Ihr)(en|em|er|e|es)?\b/g,(_,word,suffix)=>`Dein${suffix??''}`)
  .replace(/\bIhnen\b/g,'dir')
  .replace(/(^|[.!?] +)(Melden|Wählen|Schreiben|Öffnen|Suchen|Rufen|Bringen|Nutzen|Laden|Schauen|Kommen|Sagen) Sie\b/g,
   (_,prefix,word)=>prefix+(word==='Melden'?'Melde':word.slice(0,-1)))
  .replace(/\b([A-Za-zäöüÄÖÜß]+) Sie\b/g,(whole,word)=>verb[word.toLowerCase()]||/en$/i.test(word)?
   `${/^[A-ZÄÖÜ]/.test(word)?change(word)[0].toUpperCase()+change(word).slice(1):change(word)} du`:whole)
  .replace(/\bSie ([A-Za-zäöüÄÖÜß]+)\b/g,(whole,word)=>verb[word.toLowerCase()]||/en$/i.test(word)?`du ${change(word)}`:whole)
  .replace(/\bSie\b/g,'dich').replace(/([.!?]\s+|^)(du)\b/g,'$1Du');
}
