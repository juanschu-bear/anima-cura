import type {createServerClient} from '@/lib/db/supabase';
import {anonymizeRetrieval} from './animahost-retrieval-privacy';
import {maskBirthDates} from './animahost-chat-identity';
import {remainingPersonNames} from './animahost-retrieval-redaction';
export async function readDailyReview(db:ReturnType<typeof createServerClient>,tenant:string,day:string,anonymous:boolean,lineCredential?:string|null){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)throw Error('review_date_invalid');
 const secret=lineCredential||process.env.ANIMALINE_CONTROL_SECRET;
 if(!secret)throw Error('daily_review_not_configured');
 const url=new URL(process.env.ANIMALINE_CHATS_URL??'https://animaline.vercel.app/api/chats');url.searchParams.set('tenantId',tenant);url.searchParams.set('dailyReview','1');url.searchParams.set('day',day);
 const response=await fetch(url,{headers:{authorization:`Bearer ${secret}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('daily_review_unavailable');
 const data=await response.json();if(!Array.isArray(data.entries))throw Error('daily_review_invalid');
 if(!anonymous)return {...data,anonymized:false};
 const names:string[]=[];
 for(let offset=0;;offset+=1000){const people=await db.from('patients').select('vorname,nachname,versicherter_vorname,versicherter_nachname,eb2_vorname,eb2_nachname').order('id').range(offset,offset+999);if(people.error)throw Error('review_anonymization_unavailable');names.push(...people.data.flatMap(p=>Object.values(p)).filter((n):n is string=>typeof n==='string'));if(people.data.length<1000)break;}
 const settings=await db.from('animahost_whatsapp_settings').select('model').eq('tenant_id',tenant).single();if(settings.error)throw Error('review_anonymization_unavailable');
 const texts=data.entries.flatMap((r:any)=>[r.input,r.answer,r.translation?.text,JSON.stringify(r.checks)]).filter((t:unknown):t is string=>typeof t==='string');
 for(let i=0;i<texts.length;i+=80){const chunks=[0,20,40,60].map(offset=>texts.slice(i+offset,i+offset+20)).filter(part=>part.length);const found=await Promise.all(chunks.map(part=>remainingPersonNames(part.map((s:string)=>anonymizeRetrieval(s,names)),settings.data.model)));names.push(...found.flat());}
 const redact=(v:unknown):unknown=>typeof v==='string'?maskBirthDates(anonymizeRetrieval(v,names)):Array.isArray(v)?v.map(redact):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,redact(x)])):v;
 return {day:data.day,timeZone:data.timeZone,anonymized:true,entries:data.entries.map((r:any,i:number)=>({...r,eventId:undefined,messageId:undefined,chatJid:undefined,ref:'E'+String(i+1).padStart(3,'0'),input:redact(r.input),answer:redact(r.answer),translation:redact(r.translation),checks:redact(r.checks)}))};
}
