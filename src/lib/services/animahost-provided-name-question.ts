import {senderDeclaration,subjectNameText} from './animahost-name-match';
import {replySentences} from './animahost-reply-quality';
/** Remove only a name request about an explicitly named person; retain a genuinely missing DOB request. Never establishes identity. */
export function removeProvidedNameRequests(text:string,supplied:string){
 const normalized=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('de').replace(new RegExp(String.raw`[^\p{L}\p{N}]+`,'gu'),' ').trim();
 const source=normalized(supplied),removed:string[]=[];
 const full=(value:string|null)=>Boolean(value&&new RegExp(String.raw`^[A-ZÄÖÜ][\p{L}'’‑-]+(?:\s+(?:[A-ZÄÖÜ][\p{L}'’‑-]+|von|van|de|der)){1,7}$`,'u').test(value.trim()));
 const senderSupplied=full(senderDeclaration(supplied));
 const childSupplied=full(subjectNameText(supplied));
 let result=text;
 for(const sentence of replySentences(text)){
  if(!/\b(?:nenn\w*|schreib\w*|mitteil\w*|wie heißt|wie heisst|wie heißen|wie heissen|unter welchem)\b/i.test(sentence)||!/(?:\bNamen?\b|wie hei(?:ß|ss))/i.test(sentence))continue;
  const named=Array.from(sentence.matchAll(new RegExp(String.raw`\b(?:von|für)\s+([\p{Lu}][\p{L}'’‑-]+(?:\s+[\p{Lu}][\p{L}'’‑-]+){1,3})\b`,'gu')),m=>m[1]);
  // The complete name must already occur in a patient-supplied message, not only in model history.
  const direct=senderSupplied&&/(?:Ihren?|deinen?|wie hei(?:ß|ss)|unter welchem Namen)/i.test(sentence);
  const subject=childSupplied&&/(?:Kind|Sohn|Tochter|Patient|Person|vollständigen Namen|vollen Namen)/i.test(sentence);
  if(!direct&&!subject&&!named.some(n=>(' '+source+' ').includes(' '+normalized(n)+' ')&&!/^(?:Guten|Vielen|Sehr|Liebe)\b/.test(n)))continue;
  const withoutName=sentence.replace(/(?:Ihren?|den)\s+(?:(?:vollen|vollständigen|Vor- und Nach)\s+)?Namen\s+und\s+(?=(?:das|Ihr|ihr)\s+Geburtsdatum)/i,'');
  if(withoutName!==sentence){result=result.replace(sentence,withoutName);removed.push(sentence);}
  else if(!/Geburtsdatum|geboren/i.test(sentence)){result=result.replace(sentence,'');removed.push(sentence);}
 }
 return {text:removed.length?result.trim():text,removed};
}
