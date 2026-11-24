import {t} from '@/lib/i18n';
import type {TeamDeadline} from './animahost-team-time';

export function safePracticeReply(message:string,register:'du'|'Sie',deadline:TeamDeadline|null|undefined){
 const variant=register==='du'?'.du':'';
 const key=/lastschrift|abbuchung/i.test(message)?'direct_debit':
  /abhol/i.test(message)?'pickup':/doctolib|termin|buchung|appointment|wann|uhr|komm/i.test(message)?'booking':
  /rechnung|zahlung|überweis|invoice/i.test(message)?'billing':
  /spange|draht|bracket|attachment|schiene|abdruck|abdrücke/i.test(message)?'appliance':
  /röntgen|behandler|entfern/i.test(message)?'treatment_statement':'general';
 const teamSummary=t('animahost.safe.'+key+(['general','appliance'].includes(key)?variant:''),'de');
 return {text:withTeamDeadline(teamSummary,register,deadline),teamSummary,dueAt:deadline?.dueAt};
}

export function withTeamDeadline(text:string,register:'du'|'Sie',deadline:TeamDeadline|null|undefined){
 return deadline?`${text} ${t('animahost.safe.reply'+(register==='du'?'.du':''),'de',{when:deadline.phrase})}`:text;
}
