import {replySentences} from './animahost-reply-quality';
/** The practice WhatsApp channel does not accept incoming telephone calls. Emergency services are separate. */
export function practiceCallInvitations(text:string){
 return replySentences(text).filter(sentence=>{
  if(/(?:bitte|Sie|du).{0,20}(?:nicht|keinesfalls).{0,35}anrufen|keine (?:eingehenden )?Anrufe|nicht telefonisch erreichbar/i.test(sentence))return false;
  const practice=/\b(?:uns|Praxis|Praxishandy|Handynummer|0341|0179)\b/i.test(sentence);
  if(!practice&&/\b(?:112|116\s?117|Notruf|Notdienst|Rettungsdienst|Bereitschaftsdienst)\b/i.test(sentence))return false;
  if(/\b(?:rufen|ruf|ruft)\s+(?:Sie\s+|du\s+|ihr\s+)?(?:uns\s+|mich\s+|bitte\s+|kurz\s+|doch\s+|einfach\s+|gleich\s+|am besten\s+|in der Praxis\s+|bei uns\s+)*[^.!?]{0,80}\b(?:an|durch)\b/i.test(sentence)&&!/(?:wir|ich|das Team|Praxisteam)\s+(?:rufen|ruft|rufe)\b/i.test(sentence))return true;
  return /\b(?:anrufen|telefonisch erreichen|telefonisch erreichbar)\b/i.test(sentence)&&!/(?:wir|ich|das Team|Praxisteam)[^.!?]{0,45}(?:Sie|Ihnen|dich|bei dir)[^.!?]{0,30}(?:anrufen|telefonisch)/i.test(sentence)
   ||/Sie erreichen uns|du erreichst uns|Telefon\s*:?\s*(?:\+49|0\d)|melden Sie sich.{0,40}telefonisch|melde dich.{0,40}telefonisch|(?:bitte|können|kannst|sollten|solltest).{0,45}(?:durchklingeln|telefonieren)|(?:bitte|kurzer|kurzen|einfach).{0,25}Anruf/i.test(sentence);
 });
}
export function unconfirmedOpeningHours(text:string){
 return replySentences(text).filter(sentence=>/Sprechzeiten?|Öffnungszeiten?|geöffnet|schließen|(?:wir sind|sind wir).{0,70}(?:da|erreichbar)/i.test(sentence)&&/(?:\d{1,2}(?::\d{2}|[.]\d{2})?\s*Uhr|Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)/i.test(sentence));
}
export function removeSentences(text:string,sentences:readonly string[]){let result=text;for(const sentence of sentences)result=result.replace(sentence,'');return result;}
