import {isNeutralDoctorReferral} from './animahost-reply-quality';
import type {TeamDeadline} from './animahost-team-time';

const berlin='Europe/Berlin';
const dateLabel=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:berlin}).format(date);
const escape=(term:string)=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

export function deadlineContext(deadline:TeamDeadline|null|undefined,receivedAt:Date){
 const due=deadline?new Date(deadline.dueAt):null;
 if(!due||!Number.isFinite(+due)||!Number.isFinite(+receivedAt))return null;
 const date=dateLabel(due);
 const time=new Intl.DateTimeFormat('de-DE',{timeZone:berlin,timeStyle:'short'}).format(due);
 const weekday=new Intl.DateTimeFormat('de-DE',{timeZone:berlin,weekday:'long'}).format(due);
 return {dueAt:due.toISOString(),datum:date,uhrzeit:time,wochentag:weekday,heute:dateLabel(receivedAt)===date,wortlaut:deadline!.phrase};
}

export function approvedDeadlineMatches(text:string,context:ReturnType<typeof deadlineContext>){
 if(!context)return [];
 const [hour,minute]=context.uhrzeit.split(':');
 const [,month,day]=context.datum.split('-');
 const time=minute==='00'?`0?${Number(hour)}(?::00)?\\s*Uhr`:`${escape(context.uhrzeit)}\\s*(?:Uhr)?`;
 const due=new Date(context.dueAt);
 const longDate=new Intl.DateTimeFormat('de-DE',{timeZone:berlin,day:'numeric',month:'long'}).format(due);
 const weekday=escape(context.wochentag);
 const numericDate=`0?${Number(day)}\\.0?${Number(month)}\\.(?:${context.datum.slice(0,4)})?`;
 const date=context.heute?`(?:heute|${weekday})`:`(?:(?:am |bis )?${weekday}(?:,? (?:${escape(longDate)}|${numericDate}))?|am (?:${escape(longDate)}|${numericDate}))`;
 const dayPrefix=context.heute?String.raw`(?:${date}\s+)?`:String.raw`${date}\s+`;
 const when=String.raw`${dayPrefix}bis\s+(?:spätestens\s+)?${time}`;
 const statement=new RegExp(String.raw`\b(?:(?:Sie hören|Du hörst)\s+${when}\s+von uns|(?:wir|das(?: Praxis)?team)\s+meld(?:et sich|en uns)\s+(?:(?:bei Ihnen|bei dir)\s+)?${when}|(?:eine )?Rückmeldung(?: bekommen Sie| bekommst du)?\s+${when})`,'gi');
 return Array.from(text.matchAll(statement),match=>({start:match.index,end:match.index+match[0].length}));
}

function allOccurrencesBelongTo(text:string,quote:string,ranges:ReturnType<typeof approvedDeadlineMatches>){
 let at=text.indexOf(quote);
 if(at===-1)return false;
 while(at!==-1){
  if(!ranges.some(range=>range.start<=at&&at+quote.length<=range.end))return false;
  at=text.indexOf(quote,at+quote.length);
 }
 return true;
}

const person=String.raw`([\p{L}\p{M}'’-]+(?: [\p{L}\p{M}'’-]+){0,2})`;
const neutralTeamCheck=[
 new RegExp(String.raw`^(?:das (?:Praxis)?team|wir) prüf(?:t|en) (?:das |es )?für ${person}$`,'iu'),
 new RegExp(String.raw`^(?:(?:ich lasse(?: das| es)?|das lasse ich|wir lassen(?: das| es)?|das|es)(?: gleich| kurz| gern| jetzt)? )?vom (?:Praxis)?team für ${person} prüfen(?: zu lassen)?$`,'iu'),
];
const words=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('de').split(new RegExp(String.raw`[^\p{L}\p{M}'’-]+`,'u')).filter(Boolean);

const accountCheck=/^(?:Das (?:Praxis)?team|Wir) (?:gleicht|gleichen) (?:Ihre|deine|die) Angaben (?:jetzt )?mit (?:dem Patientenkonto|Ihrem Konto|deinem Konto) ab und (?:prüft|prüfen) die Vollmacht für (?:Ihren Bruder|Ihre Schwester|deinen Bruder|deine Schwester)$/i;
const permissionCheck=new RegExp(String.raw`^Für (?:Ihre|deine) (?:Schwester|Bruder) ${person} prüft das (?:Praxis)?team, ob wir (?:ihre|seine) Rechnungen an (?:Sie|dich) herausgeben dürfen$`,'iu');

const generalInvoiceFlow=/^(?:(?:sobald|wenn) (?:die|eine|Ihre|deine) Rechnung freigegeben (?:ist|wird),|nach der Freigabe) (?:erscheint|kommt|wird) (?:sie|(?:die|eine|Ihre|deine) Rechnung) (?:automatisch )?in der App(?: angezeigt)? und (?:per|als) E-Mail(?: verschickt)?$/i;
const ownVisibility=/^(?:(?:Sie sehen|Du siehst) (?:die|Ihre|deine) Rechnung (?:noch )?nicht in der App|(?:Die|Ihre|Deine) Rechnung ist für (?:Sie|dich) (?:noch )?nicht in der App sichtbar)$/i;
const reportedHiddenInvoice=/\brechnung\w*[^.!?]{0,90}\b(?:nicht|noch nicht)\b[^.!?]{0,50}(?:app|sichtbar|auf|sehen|angezeigt)|\b(?:ich sehe|mir wird)\b[^.!?]{0,45}\bkeine Rechnung\b/i;

export function exemptReplyFinding(kind:string,quote:string,draft:string,deadlines:ReturnType<typeof approvedDeadlineMatches>,namedBySender:string,currentMessage:string){
 const fragment=quote.trim().replace(/[.!?]+$/,'');
 if(!fragment)return false;
 if(kind==='medical_advice')return isNeutralDoctorReferral(quote);
 if(kind==='invented_appointment_or_cost')return allOccurrencesBelongTo(draft,fragment,deadlines);
 if(kind==='confidential_unconfirmed'){
  if(allOccurrencesBelongTo(draft,fragment,deadlines)||generalInvoiceFlow.test(fragment)||ownVisibility.test(fragment)&&reportedHiddenInvoice.test(currentMessage))return true;
  if(accountCheck.test(fragment))return true;
  const supplied=new Set(words(namedBySender));
  const permission=permissionCheck.exec(fragment);
  if(permission&&words(permission[1]).every(word=>supplied.has(word)))return true;
  return neutralTeamCheck.some(pattern=>{
   const match=pattern.exec(fragment);
   return Boolean(match&&words(match[1]).every(word=>supplied.has(word)));
  });
 }
 return false;
}
