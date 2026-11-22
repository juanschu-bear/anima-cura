import type {createServerClient} from '@/lib/db/supabase';
import {normalizeContactPhone} from './animahost-contact-notices';

type Db=ReturnType<typeof createServerClient>;
export type PhonePatient={id:string;vorname:string;nachname:string;geburtsdatum:string|null;geschlecht:string|null};
export type SubjectTask='appointment'|'late_arrival'|'attendance_certificate'|'missing_invoice'|'financial';
export type ChatContext={
 journey?:{kind:'appointment'|'portal';step:number;at:string};
 challenge?:{kind:'missing_invoice'|'financial';patientId?:string;question:string;attempts:number;at:string};
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
export function selectPhonePatient(list:PhonePatient[],text:string){
 if(list.length===1)return list[0];
 const line=` ${normalized(text)} `;
 const mentioned=list.filter(p=>line.includes(` ${normalized(p.vorname)} `)||
  line.includes(` ${normalized(`${p.vorname} ${p.nachname}`)} `));
 return mentioned.length===1?mentioned[0]:null;
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
 const matches=rows.data.filter(p=>patientNumber?String(p.ivoris_nummer??'').replace(/^0+/,'')===patientNumber.replace(/^0+/,''):
  [`${p.vorname} ${p.nachname}`,`${p.nachname} ${p.vorname}`].some(name=>named===normalized(name)));
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
