import {t} from '@/lib/i18n';
import type {ConversationHistory} from './animahost-whatsapp-conversation';
import {lastPracticeReply,type OutboundTurn} from './animahost-retrieval-routing';

export type ClosingKind='thanks'|'agreement'|'correction'|'none';
const times=/(?:[01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:uhr)?\b/gi;
const days=/\b(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|übermorgen|morgen|heute)\b/i;
const commitment=/\b(?:(?:ich|wir)\s+(?:werde[n]?|kann|können|komme[n]?|bin|sind|nehme[n]?|überweise[n]?)\b[^!?]{0,100}(?:kommen|dort sein|da sein|abholen|wahrnehmen|überweis\w*|uhr|\d:\d)|(?:ich|wir)\s+überweise[n]?\b|kommt\s+(?:heute|morgen|übermorgen|am\s+\w+)|(?:der termin|die uhrzeit|das)\s+passt)\b/i;

export function classifyPlainClosing(message:string,social:string|null):ClosingKind{
 if(/[?]|\b(?:aber|stattdessen|bzw\.|nur wenn|wäre|könnt(?:e|en|est)|kann ich|geht das|wann|wo|welch\w+|verschieb\w*|umbuch\w*|früher|später|absag\w*|doch nicht|geht nicht|nicht kommen|nicht abholen|überweisen soll|ob .*\bstimmt)\b/i.test(message))return 'none';
 if(new RegExp(String.raw`^[\p{L}\p{M}'’-]+\s*\*$`,'u').test(message.trim()))return 'correction';
 const content=message.trim().replace(/^(?:hallo|guten (?:tag|morgen|abend)|hi)[!, .\n]+/i,'');
 if(!/\b(?:kaputt|schmerzen|abgebrochen|herausgefallen|abgegangen|nicht angekommen|fehlt|zwickt|sticht)\b/i.test(content)&&
  commitment.test(content)&&(/^(?:ich|wir|kommt)\b/i.test(content)||/\bdank\w*\b/i.test(content)))return 'agreement';
 if(social==='social:acknowledged')return /dank|thanks|gracias|schönen|wochenende/i.test(message)?'thanks':'agreement';
 return 'none';
}

export function closingReply(kind:ClosingKind,input:{message:string;history:ConversationHistory;receivedAt:string;lastOutbound?:OutboundTurn}){
 if(kind==='none')return null;
 if(lastPracticeReply(input.history,input.receivedAt,input.lastOutbound))return {action:'klaerfall' as const,rule:'conversation:practice_reply',text:'',skipSend:true,teamSummary:t('animahost.whatsapp.practice_reply','de')};
 const latest=input.lastOutbound??input.history.filter(turn=>turn.direction==='outgoing').at(-1);
 const bot=latest?.source==='animahost';
 if(!bot&&(kind==='thanks'||kind==='correction'))return {action:'antworten' as const,rule:'social:acknowledged',text:'',skipSend:true};
 if(kind==='thanks'||kind==='correction')return {action:'antworten' as const,rule:'conversation:acknowledged',text:t(kind==='thanks'?'animahost.close.thanks':'animahost.close.noted','de')};
 const [time,...moreTimes]=input.message.match(times)??[];
 const day=input.message.match(days)?.[0];
 const previous=input.history.filter(turn=>turn.direction==='outgoing').at(-1)?.text;
 // Echo an agreed time only when the prior turn proposed the same time and day.
 const timeValue=time?.replace(/\s*uhr\s*$/i,'').trim();
 const matching=day&&timeValue&&!moreTimes.length&&previous?.toLowerCase().includes(day.toLowerCase())&&
  previous.includes(timeValue)&&!/\b(?:prüf\w*|noch offen|unbestätigt|vorbehaltlich)\b/i.test(previous);
 return {action:'antworten' as const,rule:'conversation:acknowledged',text:matching?
  t('animahost.close.until','de',{day,time:timeValue}):t('animahost.close.noted','de')};
}
