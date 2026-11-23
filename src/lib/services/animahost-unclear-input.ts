import {t} from '@/lib/i18n';

/** Conversation clarification only: never opens links or interprets codes as patient facts. */
export function unclearInput(message:string,messageType:string){
 const text=message.trim();
 if(messageType==='sticker')return 'sticker';
 if(/^(?:https?:\/\/|www\.)\S+(?:\s+(?:https?:\/\/|www\.)\S+)*$/i.test(text))return 'link';
 if(/^(?:huhu|hallo|hi|hey|guten (?:morgen|tag|abend))[!,.\s]*$/i.test(text))return 'greeting';
 if(/^\d{3,}$/.test(text))return 'code';
 if(/^(?:ich wollte|ich habe|könnten sie|kann ich|wegen|also|und dann)[\s.…]*$/i.test(text))return 'fragment';
 if(new RegExp(String.raw`^\p{L}{2,}[!.…]*$`,'u').test(text)&&
  !/termin|absage|verschieb|buch|rechnung|mahnung|zahlung|bezahlen|kosten|hilfe|notfall|schmerz|spang|schien|aligner|retainer|bracket|attachment|draht|gummi|gerät|wachs|parken|adresse|öffnungs|sprechzeit|app|portal|anmeld|code|konto|passwort|bescheinig|anhang/i.test(text))return 'word';
 if(text&& !new RegExp('[\\p{L}\\p{N}]','u').test(text))return 'signal';
 return null;
}
export function unclearReply(input:{kind:string;round:number;teamTime:string;at?:string;name?:string;register?:'du'|'Sie';serious?:boolean;locale?:string}){
 const casual=input.register==='du';
 const link=input.kind==='link';
 const locale=input.locale??'de';
 const say=(key:string,values?:Record<string,string>)=>t('animahost.whatsapp.unclear.'+key,locale,values);
 const linkNote=link?' '+say('link_closed'):'';
 const values={linkNote,teamTime:input.teamTime};
 if(input.round>=2)return {action:'klaerfall' as const,rule:'conversation:outside_scope',
  text:say(casual?'handoff_du':'handoff_sie',values),teamSummary:say('team_summary')};
 if(input.round===1)return {action:'antworten' as const,rule:'conversation:clarify_second',
  text:say(casual?(input.serious?'second_du_straight':'second_du'):'second_sie',values)};
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date(input.at??Date.now())));
 const name=input.name?.trim();
 const greeting=[say(hour<11?'morning':hour<18?'day':'evening'),name].filter(Boolean).join(' ');
 const key=link?(input.serious?'link_straight':casual?'link_du':'link_sie'):
  casual?(input.kind==='greeting'&&!input.serious?'greeting_du':'ask_du'):name?'ask_sie_named':'ask_sie';
 return {action:'antworten' as const,rule:'conversation:clarify_first',text:say(key,{greeting,name:name??''})};
}
/** Count only delivered clarification texts in the supplied chat, reset by a substantive answer. */
export function clarificationRound(prior:Array<{rule_id:string;patient_text?:string}>,history:Array<{direction:string;text:string}>){
 const sent=new Set(history.filter(h=>h.direction==='outgoing').map(h=>h.text.trim()));let round=0;
 for(const row of prior){if(!row.patient_text||!sent.has(row.patient_text.trim()))continue;
  if(!/^conversation:clarify_(first|second)$/.test(row.rule_id))break;round++;}
 return Math.min(2,round);
}
