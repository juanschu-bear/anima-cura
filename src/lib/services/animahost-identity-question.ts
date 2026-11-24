/** Remove only repeated sender-identity requests; preserve every other character. */
export function removeKnownIdentityQuestions(text:string,known:{name:boolean;birthDate:boolean}){
 const removed:string[]=[];
 const result=Array.from(new Intl.Segmenter('de',{granularity:'sentence'}).segment(text),({segment})=>{
  const asks=/(?:\?|\bbitte\b|\b(?:nennen|schicken|senden|mitteilen|verraten|angeben|benötige|brauche)\b)/i.test(segment);
  const name=known.name&&/(?:\bIhren?\s+(?:(?:vollen|vollständigen|Vor[- ]?und Nach)\s*)?Namen\b|\bwie\s+(?:heißen|heissen)\s+Sie\b|unter welchem Namen\b|\bwer\s+schreibt\b)/i.test(segment);
  const birthDate=known.birthDate&&/(?:\bIhr(?:em|en)?\s+Geburtsdatum\b|\b(?:das|dem)\s+Geburtsdatum\b|\bwann\s+sind\s+Sie\s+geboren\b)/i.test(segment);
  if(!asks||!name&&!birthDate)return segment;
  removed.push(segment.trim());
  // Delete the sentence itself, keeping surrounding whitespace byte-for-byte.
  return segment.replace(/\S[\s\S]*\S|\S/,'');
 }).join('');
 return {text:result,removed};
}
