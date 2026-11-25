import type {ConversationHistory} from './animahost-whatsapp-conversation';
import {candidateRules,type WhatsAppRule} from './animahost-whatsapp';

export type RepeatKind='deadline'|'emergency_112'|'doctolib_link'|'get_well'|'phone_contact'|'sentence';
export type RepeatedSentence={kind:RepeatKind;quote:string};
const segmenter=new Intl.Segmenter('de',{granularity:'sentence'});
export function replySentences(text:string){
 const parts:string[]=[];
 for(const part of text.split(/(?<=\n)/).flatMap(line=>Array.from(segmenter.segment(line),s=>s.segment))){
  // German ordinals are dates, not sentence ends: keep '25. November, 10 Uhr' together.
  const previous=parts.at(-1)??'';
  if(/\b\d{1,2}\.\s*$/.test(previous)&&/^\s*(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|\d{1,2}\.)\b/i.test(part))parts[parts.length-1]+=part;
  else parts.push(part);
 }
 return parts.map(part=>part.trim()).filter(Boolean);
}
const normalize=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('de').replace(new RegExp('[^\\p{L}\\p{N}]+','gu'),' ').trim();
const phoneNumbers=(text:string)=>Array.from(text.matchAll(/(?:\+49|0049|0)[\d ()/-]{7,}/g),m=>m[0].replace(/\D/g,'').replace(/^0049/,'49').replace(/^0/,'49'));
const identityReply=(text:string)=>new RegExp('^(?:[Ii]ch bin|[Mm]ein Name(?: ist)?|[Ii]ch heiße)\\s+[A-ZÄÖÜ][\\p{L}]+(?:[ \\t]+[A-ZÄÖÜ][\\p{L}]+){0,4}(?:[.!\\n]|$)','u').test(text.trim())||/^(?:\[Datum\]|\d{1,2}\.\s*\d{1,2}\.\s*\d{4})[.\s]*$/.test(text.trim());
export function replyCategories(text:string):RepeatKind[]{
 const kinds:RepeatKind[]=[];
 if(/\b(?:hören|hörst|meld\w*|rückmeld\w*|klärt|prüft|schaut)\b[^.!?]{0,180}\b(?:bis\b[^.!?]{0,90}\bUhr|heute|morgen|Mittwoch|Donnerstag|Freitag|Montag|Dienstag)/i.test(text))kinds.push('deadline');
 if(/ruf|telefon|erreich/i.test(text)&&phoneNumbers(text).length)kinds.push('phone_contact');
 if(/\b112\b/.test(text))kinds.push('emergency_112');
 if(/\{doctolib_link\}|doctolib[^\s]*|\[Link\]/i.test(text))kinds.push('doctolib_link');
 if(/gute Besserung|(?:gute|schnelle|baldige) Genesung|werd\w*[^.!?]{0,20}(?:gesund|fit)|bald wieder (?:gesund|fit)/i.test(text))kinds.push('get_well');
 return kinds;
}
const topics=(s:string)=>[
 ['appointment',/termin|verschieb|absag|stornier|verspät|stau|straßen.{0,20}voll/i],
 ['finance',/rechnung|abbuch|erstatt|zahlung|raten|konto/i],
 ['identity',/vollmacht|auftrag|kommuniz|geburt|\[Datum\]|\b\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\b/i],
 ['appliance',/spange|schiene|draht|bracket|attachment|retainer/i],
 ['illness',/husten|krank|fieber|schmerz|atem|sorgen/i],
].filter(([,pattern])=>(pattern as RegExp).test(s)).map(([key])=>key as string);
/** A new explicit subject permits its own first deadline. Short follow-ups retain the subject. */
export function hasPriorConcernReply(message:string,history:ConversationHistory){
 const last=history.findLastIndex(h=>h.direction==='outgoing'&&h.source==='animahost');
 if(last<0)return false;
 const before=history.slice(0,last).filter(h=>h.direction==='incoming').slice(-3).map(h=>h.text).join(' ');
 const current=topics(message),previous=topics(before);
 if(/(?:anderes|neues|weiteres) Anliegen|andere Frage|außerdem|noch eine Frage/i.test(message))return false;
 return identityReply(message)||!current.length||!previous.length||current.some(t=>previous.includes(t))||current.every(t=>t==='identity');
}
export function repeatedReplySentences(text:string,history:ConversationHistory,message:string):RepeatedSentence[]{
 const old=history.filter(h=>h.direction==='outgoing'&&h.source==='animahost').flatMap(h=>replySentences(h.text));
 const oldPhones=new Set(old.flatMap(phoneNumbers));
 const used=new Set(old.flatMap(replyCategories)),sentences=new Set(old.map(normalize));
 const continuation=hasPriorConcernReply(message,history);
 return replySentences(text).flatMap(quote=>{
  const kinds=replyCategories(quote).filter(k=>k==='deadline'?continuation:k==='phone_contact'?phoneNumbers(quote).some(p=>oldPhones.has(p)):used.has(k));
  if(!kinds.length&&!(replyCategories(quote).includes('deadline')&&!continuation)&&normalize(quote).length>=24&&sentences.has(normalize(quote)))kinds.push('sentence');
  return kinds.map(kind=>({kind,quote}));
 });
}
export function matchedReplyRules(message:string,rules:WhatsAppRule[],history:ConversationHistory=[]){
 if(identityReply(message))message=[...history.filter(h=>h.direction==='incoming').slice(-3).map(h=>h.text),message].join('\n');
 const ids=new Set(candidateRules(message,rules).map(r=>r.id));
 const appointment=/termin|buchung/i.test(message);
 if(appointment&&/verschieb|verleg|umbuch|tausch/i.test(message))ids.add('termin-verschieben');
 // Asking whether an already requested change is confirmed is not a new booking request.
 const confirmation=/bestätigung|bestätigt|geht[^.!?]{0,120}(?:klar|in Ordnung)/i.test(message);
 const newRequest=/(?:möchte|muss|will|bitte|könn(?:en|t)|würde)[^.!?]{0,100}(?:verschieb|verleg|umbuch|tausch)/i.test(message);
 if(confirmation&&!newRequest)ids.delete('termin-verschieben');
 if(appointment&&/absag|stornier|nicht.{0,25}kommen|fällt aus/i.test(message))ids.add('termin-absagen');
 // Illness alone is not a request to cancel an appointment.
 if(!appointment&&!/absag|stornier|kann nicht kommen|schaffe es nicht/i.test(message))ids.delete('termin-absagen');
 return rules.filter(r=>ids.has(r.id));
}
export const isInfoReplyRule=(rule:WhatsAppRule)=>['termin-verschieben','termin-absagen','termin-verpasst-oder-vergessen'].includes(rule.id)&&rule.action==='antworten';
/** Only a referral itself is exempt, never a diagnosis or treatment attached to it. */
export function isNeutralDoctorReferral(quote:string){
 const fragment=quote.trim().replace(/[.!]+$/,'');
 const doctor='(?:Kinderarzt(?:praxis)?|Hausarzt(?:praxis)?|Kinderärztin|Hausärztin)';
 const referral=[
  `^(?:(?:Ansonsten|Sonst|Dort) )?(?:ist|sind|bist|wäre|wären) (?:er|sie|du|Ihr Sohn|Ihre Tochter|Ihr Kind) (?:beim|bei der) ${doctor} gut aufgehoben$`,
  `^Für [^.!?;]{1,60} ist (?:der|die|Ihr|Ihre|dein|deine) ${doctor} die richtige (?:Adresse|Anlaufstelle)(?: zur Abklärung|, falls [^.!?;]{1,90} abklären (?:möchten|möchtest))?$`,
  `^Bei [^.!?;]{1,45} (?:Husten|Beschwerden) hilft (?:nur )?ein Blick (?:von|aus) einer ${doctor}$`,
  `^(?:Bitte )?(?:wenden Sie sich|wende dich|fragen Sie|frag|kontaktieren Sie|kontaktiere|rufen Sie|ruf) (?:bitte )?(?:an |bei )?(?:Ihren?|deinen?|die|der|eine?n?)? ?${doctor}(?: an)?$`,
  `^(?:Sonst )?(?:würde ich|sollten Sie|solltest du|können Sie|kannst du|lassen Sie|lass|bitte lassen Sie) (?:bitte )?(?:das|den Husten|die Beschwerden|es) (?:beim |bei der |vom |von der )?${doctor} abklären(?: lassen)?$`,
  `^(?:Sonst )?(?:würde ich|sollten Sie|solltest du|können Sie|kannst du|lassen Sie|lass|bitte lassen Sie) (?:bitte )?(?:das|den Husten|die Beschwerden|es) (?:kinderärztlich|hausärztlich) abklären(?: lassen)?$`,
  `^Für Fragen zu [^.!?;]{1,70} ist (?:Ihre|deine|die) ${doctor} die richtige (?:Adresse|Anlaufstelle)$`,
 ];
 return referral.some(pattern=>new RegExp(pattern,'i').test(fragment));
}

/** A model may echo the input envelope. Only the patient field can reach verification/transport. */
export function patientReplyText(raw:string):{text:string;unwrapped:boolean}{
 const value=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 if(value.startsWith('{')||value.startsWith('[')){
  let parsed:unknown;try{parsed=JSON.parse(value);}catch{throw Error('invalid_patient_reply_envelope');}
  if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||!('nachricht' in parsed)||typeof parsed.nachricht!=='string')throw Error('invalid_patient_reply_envelope');
  const nested=patientReplyText(parsed.nachricht);
  return {text:nested.text,unwrapped:true};
 }
 if(/prüferHinweis|PATIENTENBLATT|vertraulicheAktenFreigegeben/.test(value))throw Error('internal_reply_fields');
 return {text:raw,unwrapped:false};
}
