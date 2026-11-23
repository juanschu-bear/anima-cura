import {t} from '@/lib/i18n';
import type {ConversationHistory} from './animahost-whatsapp-conversation';
import type {PatientSheet} from './animahost-patient-sheet';
import type {WhatsAppRule} from './animahost-whatsapp';

const landline='0341 9806457';
export const practiceReplyRule='conversation:practice_reply';
export const immediateRule='conversation:immediate_practice';
export const workflowRules:WhatsAppRule[]=[
 {id:'gespraech-antwort-an-praxis',topic:'Antwort an eure Nachricht',keywords:['Antwort an die Praxis','Einwortkorrektur','kurze Zustimmung'],action:'klaerfall',patientText:'Die Praxis übernimmt diesen Gesprächsfaden. Keine automatische Nachricht.'},
 {id:'praxis-sofort-vor-ort',topic:'Akuter Anlass vor Ort oder wenige Minuten Verspätung',keywords:['vor der Praxis','Treppenhaus','Tür öffnen','Minuten später'],action:'klaerfall',patientText:'Bitte klingeln Sie an der Praxistür oder rufen Sie uns direkt unter 0341 9806457 an.'},
];

export type OutboundTurn={source:'practice'|'animahost';at:string};
export function lastPracticeReply(history:ConversationHistory,receivedAt:string,latestOutbound?:OutboundTurn){
 const at=Date.parse(receivedAt);
 const last=latestOutbound??history.filter(item=>item.direction==='outgoing'&&Date.parse(item.at)<=at).at(-1);
 const elapsed=at-Date.parse(last?.at??'');
 return last?.source==='practice'&&elapsed>=0&&elapsed<=86_400_000;
}
const followupPattern=new RegExp(String.raw`^(?:[\p{L}][\p{L}\p{M}'’-]*\s*\*|(?:ja|jep|ok(?:ay)?|okey|in ordnung|passt(?: so)?|einverstanden|alles klar|verstanden|yes|sure|vale|sí|de acuerdo)[.!…]*)$`,'iu');
export const shortPracticeFollowup=(text:string)=>followupPattern.test(text.trim());
const thanksOnly=(text:string)=>/^(?:(?:ja|ok(?:ay)?|passt)[ ,.!]*\s*)?(?:(?:vielen|lieben|besten) dank|danke(?: schön| sehr)?|thank you|thanks|muchas gracias|gracias)[.!…\s]*$/i.test(text.trim());

export function conversationRouting(message:string,history:ConversationHistory,at:string,social:string|null,register:'du'|'Sie',latestOutbound?:OutboundTurn){
 const text=message.trim();
 if(social==='social:reaction'||social==='social:unreadable'||thanksOnly(text))return null;
 const arrival=/\b(?:komme|bin)\s+(?:etwa |ca\. ?|ungefähr |heute |leider )*(?:[1-9]|10|fünf|zehn)\s*(?:minuten|min\.?)\s*(?:später|zu spät)\b/i.test(text)&&
  !/\b(?:morgen|übermorgen|nächste[nr]?|nächsten monat)\b/i.test(text);
 const atDoor=/\b(?:steh(?:e)?|bin|warte)\s+(?:schon |gerade |jetzt |noch )*(?:vor (?:der |Ihrer )?Praxis|im Treppenhaus|vor (?:der|eurer|Ihrer) Tür)\b|(?:\b(?:bitte|kannst du|können sie|könnt ihr)[^.!?]{0,40})?\b(?:die )?tür (?:aufmachen|öffnen|aufschließen)\b/i.test(text)&&
  !/\b(?:morgen|übermorgen|nächste[nr]?)\b/i.test(text);
 if(atDoor||arrival)return {action:'klaerfall' as const,rule:immediateRule,
  text:t('animahost.whatsapp.immediate.'+(atDoor?'door':'late')+'.'+(register==='du'?'du':'sie'),'de',{phone:landline}),
  teamSummary:t('animahost.whatsapp.immediate.'+(atDoor?'door_team':'late_team'),'de')};
 if(lastPracticeReply(history,at,latestOutbound)||shortPracticeFollowup(text))return {action:'klaerfall' as const,rule:practiceReplyRule,text:'',skipSend:true,
  teamSummary:t('animahost.whatsapp.practice_reply','de')};
 return null;
}

export function canAskIdentity(access:PatientSheet['access'],asked:boolean,message:string){
 if(asked||!['ambiguous','unlinked'].includes(access))return false;
 // General questions such as self-service, booking or a broken attachment do not need a name.
 return /\b(?:(?:mein(?:e|en|em|er)?|unser(?:e|en|em|er)?)\s+(?:nächsten?\s+)?(?:termin|rechnung|guthaben|rate|akte|behandlungsplan|zugang)\w*|(?:wann|welche[rn]?)\s+(?:ist|habe ich)\s+(?:mein|der)\s+(?:nächste[nr]?\s+)?termin|(?:rechnung|termin|bescheinigung)\s+(?:für|von)\s+(?:mein|unser)\w*|(?:mich|uns)\s+(?:eintragen|umbuchen)|rechnung(?:en|spdf)?.{0,60}(?:fehlt|nicht sichtbar|nicht angezeigt|nicht zu sehen|nicht angekommen|nicht erhalten))\b/i.test(message);
}

export const asksIdentity=(text:string)=>/\b(?:unter welchem namen|für welchen patienten|für wen schreiben|(?:vor-? und nach|vollständigen )?namen (?:nennen|schreiben|angeben)|(?:nenn|sag|schreib|teil)\w*[^.!?]{0,28}\b(?:namen|geburtsdatum)|wie (?:heißt du|heißen sie)|(?:dein|ihr|das) geburtsdatum|patientennummer)\b[^.!?]*(?:\?|$)/i.test(text);

export function invoicePortalRouting(message:string,sheet:PatientSheet|undefined,register:'du'|'Sie'){
 const text=message.trim();
 if(/\b(?:zahlung|bezahlt|guthaben|raten|betrag|abbuch|überweis|mahn)\w*\b/i.test(text))return null;
 const suffix=register==='du'?'du':'sie';
 const copy=(key:string)=>t('animahost.whatsapp.portal.'+key+'.'+suffix,'de');
 const noApp=/\b(?:app|download\w*|runterladen|herunterladen|installieren)\b/i.test(text)&&
  /\b(?:kein\w*|nicht|nötig|notwendig|muss ich|ohne)\b/i.test(text);
 const missing=/rechnung\w*[^!?]{0,100}(?:nicht (?:mehr )?(?:(?:in der App|im Portal|dort) )?(?:sichtbar|zu sehen|angezeigt|auffindbar)|fehlt)|(?:nicht|keine)[^!?]{0,40}rechnung\w*[^!?]{0,70}(?:portal|app|sichtbar|zu sehen)/i.test(text);
 if(!missing&&noApp&&!/\b(?:termin|spange|schmerzen|blutung)\w*\b|rechnung\w*.{0,60}(?:nicht erhalten|nicht angekommen)/i.test(text))
  return {action:'antworten' as const,rule:'billing:portal_browser',text:copy('browser')};
 if(!missing)return null;
 const context=sheet?.access==='confirmed'?sheet.context:null;
 if(context?.portalzugang===false)return {action:'antworten' as const,rule:'billing:portal_account_missing',text:copy('account_missing')};
 const invoices=Array.isArray(context?.rechnungsakteMitZustellstand)?context.rechnungsakteMitZustellstand:[];
 if(context?.portalzugang===true&&invoices.length&&!(Number(context.vollständigeRechnungImPortalNochNichtVerfügbar)>0)&&
  !/\b(?:bestimmte|vom|aus dem|letzte|erste|quartal|nummer|rechnung nr)\b/i.test(text)&&invoices.every(invoice=>invoice?.patientVisible===true))
  return {action:'antworten' as const,rule:'billing:portal_visible',text:copy('visible')};
 const knownUnavailable=Number(context?.vollständigeRechnungImPortalNochNichtVerfügbar)>0;
 return {action:'klaerfall' as const,rule:'billing:portal_missing',
  text:copy(knownUnavailable?'unavailable':'missing'),teamSummary:t('animahost.whatsapp.portal.team','de')};
}
