import { z } from 'zod';
import { t } from '@/lib/i18n';
import { closurePeriodsSchema } from './animahost-practice-closures';
import { renderWhatsAppRuleText, type WhatsAppRule } from './animahost-whatsapp';

const typeId = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
export const appointmentToleranceSchema = z.strictObject({
 okUpTo: z.number().int().min(0).max(180),
 rebookFrom: z.number().int().min(1).max(240),
 between: z.enum(['with_wait','case_by_case','not_possible']),
 lenientTypes: z.array(typeId).max(100),
 strictTypes: z.array(typeId).max(100),
}).refine(value => value.okUpTo < value.rebookFrom &&
 new Set([...value.lenientTypes,...value.strictTypes]).size === value.lenientTypes.length + value.strictTypes.length);
export type AppointmentTolerance = z.infer<typeof appointmentToleranceSchema>;
export const defaultAppointmentTolerance: AppointmentTolerance = {
 okUpTo:15, rebookFrom:30, between:'case_by_case',
 lenientTypes:['aligner-schienenkontrolle','geraetekontrolle-herausnehmbare-spange','kontrolle-feste-zahnspange','jahreskontrolle'],
 strictTypes:['erstuntersuchung-erwachsener','erstuntersuchung-kind','besprechung'],
};

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const lateIntentSchema = z.strictObject({
 appointmentDate:z.string().date().nullable(), originalTime:timeSchema.nullable(), arrivalTime:timeSchema.nullable(),
 delayMinutes:z.number().int().min(1).max(1440).nullable(),
 appointmentTypeId:typeId.nullable(), appointmentTypeEvidence:z.string().max(120).nullable().optional(), typeUnknown:z.boolean().optional(),
 usesEarlierDetails:z.boolean().optional(), challengesRefusal:z.boolean().optional(),
});
export type LateIntent = z.infer<typeof lateIntentSchema>;
export const lateStateSchema = lateIntentSchema.extend({
 refusals:z.number().int().min(0).max(2),
 outcome:z.enum(['accept','wait','rebook','pending','incomplete_review','ask_type','ask_time','already_pending','phone']),
});
export type LateState = z.infer<typeof lateStateSchema>;
export type Language = 'de' | 'en' | 'es';

const weekdays = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
const minute = (time:string) => Number(time.slice(0,2))*60+Number(time.slice(3,5));
const hhmm = (value:number) => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const openDay = (date:string, arrival:string|null, hours:string|undefined, closures:unknown) => {
 const exceptions = closurePeriodsSchema.safeParse(closures);
 if(!exceptions.success)return 'unknown';
 if(exceptions.data.some(period=>period.from<=date&&date<=period.through))return 'closed';
 const regular=/regulären Sprechzeiten sind (.+?)(?:\. |$)/i.exec(hours??'')?.[1];
 if(!regular)return 'unknown';
 const day = new Date(`${date}T12:00:00Z`).getUTCDay();
 const label = weekdays[day];
 const range = /([A-Za-z]+) bis ([A-Za-z]+)/.exec(regular);
 const included = range&&weekdays.includes(range[1])&&weekdays.includes(range[2])
  ? (day-weekdays.indexOf(range[1])+7)%7 <= (weekdays.indexOf(range[2])-weekdays.indexOf(range[1])+7)%7
  : regular.includes(label);
 if(!included)return /vereinbarung/i.test(hours??'')&&hours?.includes(label)?'unknown':'closed';
 const windows=Array.from(regular.matchAll(/von (\d{1,2}:\d{2}) bis (\d{1,2}:\d{2})/g));
 if(arrival&&windows.length&&!windows.some(([,start,end])=>minute(start.padStart(5,'0'))<=minute(arrival)&&
  minute(arrival)<minute(end.padStart(5,'0'))))return 'closed';
 return 'open';
};

export function appointmentInstant(date:string, time:string):Date {
 const nominal=Date.parse(`${date}T${time}:00Z`);
 const parts=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',timeZoneName:'shortOffset'}).formatToParts(nominal);
 const offset=Number(parts.find(part=>part.type==='timeZoneName')?.value.replace('GMT',''))||0;
 return new Date(nominal-offset*3_600_000);
}

export function planLateArrival(
 next:LateIntent, prior:LateState|null, tolerance:AppointmentTolerance, rules:WhatsAppRule[],
 hours:string|undefined, closures:unknown,
):LateState {
 const context=next.usesEarlierDetails?prior:null;
 const originalTime=next.originalTime??context?.originalTime??null;
 const arrival=next.arrivalTime??(next.delayMinutes===null?context?.arrivalTime??null:null);
 const difference=originalTime&&arrival?minute(arrival)-minute(originalTime):null;
 const delay=difference??next.delayMinutes??context?.delayMinutes??null;
 const arrivalTime=arrival??(originalTime&&delay&&minute(originalTime)+delay<1440?hhmm(minute(originalTime)+delay):null);
 const appointmentDate=next.appointmentDate??context?.appointmentDate??null;
 const knownType=(id:string|null|undefined)=>id&&(rules.some(rule=>rule.appointmentTypeId===id)||
  tolerance.lenientTypes.includes(id)||tolerance.strictTypes.includes(id))?id:null;
 const appointmentTypeId=knownType(next.appointmentTypeId??context?.appointmentTypeId);
 const refusals=context?.refusals??0;
 const fields={...next,originalTime,arrivalTime,delayMinutes:delay,appointmentDate,appointmentTypeId,refusals};
 const result=(outcome:LateState['outcome'],count=refusals):LateState=>({...fields,outcome,refusals:count});
 if(delay===null||delay<=0)return result('ask_time');
 if(context?.outcome==='pending'||context?.outcome==='already_pending'){
  if(originalTime===context.originalTime&&arrivalTime===context.arrivalTime&&appointmentDate===context.appointmentDate)
   return result('already_pending');
 }
 const open=appointmentDate?openDay(appointmentDate,arrivalTime,hours,closures):'unknown';
 const lenient=Boolean(appointmentTypeId&&tolerance.lenientTypes.includes(appointmentTypeId));
 const strict=Boolean(appointmentTypeId&&tolerance.strictTypes.includes(appointmentTypeId));
 const review=()=>originalTime&&arrivalTime&&appointmentDate?result('pending'):result('ask_time');
 const rebook=()=>context&&next.challengesRefusal&&refusals>=2?review():result('rebook',Math.min(refusals+1,2));
 if(open==='closed')return rebook();
 if(lenient&&open==='open')return result(delay<=tolerance.okUpTo?'accept':'wait');
 if(strict&&delay>=tolerance.okUpTo)return rebook();
 if(delay<tolerance.okUpTo||(delay===tolerance.okUpTo&&(appointmentTypeId||!tolerance.strictTypes.length)))return result('accept');
 if(lenient)return review();
 if(!appointmentTypeId){
  if(context&&next.challengesRefusal&&delay===tolerance.rebookFrom)
   return originalTime&&arrivalTime&&appointmentDate?result('pending'):result('incomplete_review');
  if(delay>tolerance.rebookFrom)return rebook();
  if(next.typeUnknown||context?.outcome==='ask_type')return review();
  // At the threshold, get the team involved if the patient gave enough details to assess the same visit.
  if(delay===tolerance.rebookFrom&&originalTime&&arrivalTime&&appointmentDate)return result('pending');
  return result('ask_type');
 }
 if(delay>=tolerance.rebookFrom||tolerance.between==='not_possible')return rebook();
 if(tolerance.between==='with_wait')return result('wait');
 return review();
}

export function lateReply(state:LateState,language:Language,link:string|null,phone:string|null):string {
 const vars={arrival:state.arrivalTime??'',minutes:state.delayMinutes??0,phone:phone||'0179 5351813'};
 const key=state.outcome==='rebook'&&state.challengesRefusal?'rebook_objection':state.outcome==='accept'?(state.arrivalTime?'accept_time':'accept_minutes'):
  state.outcome==='wait'?(state.arrivalTime?'wait_time':'wait_minutes'):state.outcome;
 const text=t(`animahost.late.${key}`,language,vars);
 if(state.outcome==='pending'&&!state.appointmentTypeId&&!state.typeUnknown)
  return `${text} ${t('animahost.late.ask_type',language)}`;
 const url=state.outcome==='rebook'?renderWhatsAppRuleText('{doctolib_link}',link):null;
 return url?`${text} ${t('animahost.late.book',language,{url})}`:text;
}

export function statesLaterArrival(text:string,times:Partial<LateIntent>):boolean {
 const arrival=/\b(?:komm\w*|eintreff\w*|arriv\w*|lleg\w*)\b/i.test(text);
 const late=/\b(?:später|verspät\w*|late|later|tarde)\b/i.test(text);
 if(arrival&&late&&times.delayMinutes!==undefined&&times.delayMinutes!==null)return true;
 return Boolean(times.originalTime&&times.arrivalTime&&arrival&&
  /statt|erst|schaff.{0,20}nicht|instead|rather|solo puedo|en vez/i.test(text));
}

export function recoverLateTimes(text:string,localDate:string):Partial<LateIntent>{
 const stated=Array.from(text.matchAll(/\b(\d{1,2}:\d{2})\b/g),match=>match[1].padStart(5,'0'));
 const [originalTime,arrivalTime]=stated.length===2?stated:[null,null];
 const weekday=weekdays.find(day=>new RegExp(`\\b${day}\\b`,'i').test(text));
 const listedDay=weekday?weekdays.indexOf(weekday):null;
 const anchor=new Date(`${localDate}T12:00:00Z`);
 const explicitDate=/\bheute\b/i.test(text)?localDate:
  /\bmorgen\b/i.test(text)?new Date(anchor.getTime()+86_400_000).toISOString().slice(0,10):
  listedDay!==null?new Date(anchor.getTime()+((listedDay-anchor.getUTCDay()+7)%7)*86_400_000).toISOString().slice(0,10):null;
 const writtenNumbers:Record<string,number>={fünf:5,zehn:10,fünfzehn:15,zwanzig:20,dreißig:30,vierzig:40,
  fünfundvierzig:45,ten:10,fifteen:15,twenty:20,thirty:30,forty:40,diez:10,quince:15,treinta:30};
 const statedMinutes=Array.from(text.toLocaleLowerCase().matchAll(/\b(\d{1,3}|[a-zà-ÿ]+)\s+(?:minuten?|minutes?|minutos?|min)\b/g))
  .map(match=>writtenNumbers[match[1]]??Number(match[1])).filter(value=>Number.isFinite(value)&&value>0);
 const half=/halbe stunde|half an hour|media hora/i.test(text);
 const quarter=/viertelstunde|quarter of an hour|cuarto de hora/i.test(text);
 return {
  originalTime:timeSchema.safeParse(originalTime).success?originalTime:null,
  arrivalTime:timeSchema.safeParse(arrivalTime).success?arrivalTime:null,
  appointmentDate:explicitDate,
  ...(statedMinutes.length===1||half||quarter?{delayMinutes:statedMinutes[0]??(half?30:15)}:{}),
 };
}

export function knownVisitType(text:string, intent:LateIntent, rules:WhatsAppRule[]):string|null {
 const normalize=(value:string)=>value.toLocaleLowerCase().replace(/[^a-zà-ÿ0-9]+/g,' ').trim();
 const line=normalize(text);
 const lexicallyNamed=rules.filter(rule=>rule.appointmentTypeId&&
  (line.includes(normalize(rule.appointmentTypeId))||
   rule.keywords.some(word=>normalize(word).includes(' ')&&line.includes(normalize(word)))));
 const exact=lexicallyNamed.length===1?lexicallyNamed[0].appointmentTypeId:null;
 if(exact)return exact;
 if(/erstuntersuchung|erstberatung/.test(line)){
  if(/kind|tochter|sohn/.test(line))return 'erstuntersuchung-kind';
  if(/erwachsen|für mich/.test(line))return 'erstuntersuchung-erwachsener';
 }
 const evidence=intent.appointmentTypeEvidence?normalize(intent.appointmentTypeEvidence):'';
 if(evidence.length>=6&&line.includes(evidence)&&
  /kontroll|check|untersuch|besprech|consult|schiene|aligner|repar|retainer|revision|cita inicial|revisión/i.test(evidence))
  return intent.appointmentTypeId;
 return null;
}
