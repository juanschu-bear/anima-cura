import {replySentences} from './animahost-reply-quality';
/** Remove only a name request about an explicitly named person; retain a genuinely missing DOB request. Never establishes identity. */
export function removeProvidedNameRequests(text:string,supplied:string){
 const normalized=(s:string)=>s.normalize('NFKC').toLocaleLowerCase('de').replace(new RegExp(String.raw`[^\p{L}\p{N}]+`,'gu'),' ').trim();
 const source=normalized(supplied),removed:string[]=[];
 let result=text;
 for(const sentence of replySentences(text)){
  if(!/\b(?:nenn\w*|schreib\w*|mitteil\w*|wie heißt|wie heisst)\b/i.test(sentence)||!/\bNamen\b/i.test(sentence))continue;
  const named=Array.from(sentence.matchAll(new RegExp(String.raw`\b(?:von|für)\s+([\p{Lu}][\p{L}'’‑-]+(?:\s+[\p{Lu}][\p{L}'’‑-]+){1,3})\b`,'gu')),m=>m[1]);
  // The complete name must already occur in a patient-supplied message, not only in model history.
  if(!named.some(n=>(' '+source+' ').includes(' '+normalized(n)+' ')&&!/^(?:Guten|Vielen|Sehr|Liebe)\b/.test(n)))continue;
  const withoutName=sentence.replace(/(?:Ihren?|den)\s+(?:(?:vollen|vollständigen|Vor- und Nach)\s+)?Namen\s+und\s+(?=(?:das|Ihr|ihr)\s+Geburtsdatum)/i,'');
  if(withoutName!==sentence){result=result.replace(sentence,withoutName);removed.push(sentence);}
  else if(!/Geburtsdatum|geboren/i.test(sentence)){result=result.replace(sentence,'');removed.push(sentence);}
 }
 return {text:removed.length?result.trim():text,removed};
}
