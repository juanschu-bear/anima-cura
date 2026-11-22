import {z} from 'zod';
import {t} from '@/lib/i18n';
import {closurePeriodsSchema} from './animahost-practice-closures';
import {appointmentLocalDate} from './animahost-appointment-notices';

export const teamReplyDaysSchema=z.array(z.number().int().min(1).max(7)).min(1).max(7)
 .refine(days=>new Set(days).size===days.length);
export const defaultTeamReplyDays=[1,2,3,4,5];

export function teamReplyTime(receivedAt:string,days:unknown,closures:unknown,language:string){
 const weekly=teamReplyDaysSchema.safeParse(days);
 const active=weekly.success?weekly.data:defaultTeamReplyDays;
 const period=closurePeriodsSchema.safeParse(closures);
 const date=appointmentLocalDate(receivedAt);
 const cursor=new Date(`${date}T12:00:00Z`);
 const open=(day:Date)=>active.includes(day.getUTCDay()||7)&&
  !(period.success&&period.data.some(p=>p.from<=day.toISOString().slice(0,10)&&day.toISOString().slice(0,10)<=p.through));
 const time=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})
  .format(new Date(receivedAt));
 if(open(cursor)&&time<='16:00')return t('animahost.team.today',language);
 for(let i=0;i<730;i++){
  cursor.setUTCDate(cursor.getUTCDate()+1);
  if(open(cursor)){
   const day=new Intl.DateTimeFormat(language==='en'?'en-GB':language==='es'?'es-ES':'de-DE',{
    timeZone:'UTC',weekday:'long',day:'numeric',month:'long',
   }).format(cursor);
   return t('animahost.team.onDay',language,{day});
  }
 }
 return t('animahost.team.next',language);
}
