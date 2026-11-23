type Register='du'|'Sie';
const parent=/\b(?:meine[rsnm]?|unsere[rsnm]?)\s+(?:tochter|sohn|kind|kinder)|\b(?:ich bin|hier (?:ist|schreibt))\s+(?:die mutter|der vater|ein elternteil)|\b(?:my (?:daughter|son|child)|mi (?:hijo|hija))\b/i;
const selfPatient=/\b(?:meine[rsnm]?\s+(?:spange|schiene|zahnspange|brackets?|aligner|retainer)|ich (?:bin (?:hier )?patient\w*|trage (?:eine |meine )?(?:spange|schiene|aligner))|bei mir (?:hat sich|ist).{0,60}(?:attachment|bracket|draht|schiene))\b/i;
const informal=/\b(?:du|dir|dich|dein(?:e[snmr]?)?|euch|euer(?:e[snmr]?)?|kannst|hast)\b/i;
const formal=/\b(?:Sie|Ihnen|Ihr(?:e[snmr]?)?)\b/;
const pictograph=new RegExp(String.raw`[\p{Extended_Pictographic}\p{Regional_Indicator}]|[#*0-9]\uFE0F?\u20E3`,'u');
const graphemes=new Intl.Segmenter('de',{granularity:'grapheme'});

export function replyRegister(message:string,sheetRole:unknown,afterReply:boolean,previousIncoming:readonly string[]):Register{
 if(parent.test(message)||sheetRole==='Elternteil'||sheetRole==='Begleitperson')return 'Sie';
 if(selfPatient.test(message)||sheetRole==='Patient')return 'du';
 if(!afterReply)return 'Sie';
 for(const text of [message,...previousIncoming.slice().reverse()]){
  if(parent.test(text))return 'Sie';
  if(formal.test(text))return 'Sie';
  if(informal.test(text))return 'du';
 }
 return 'Sie';
}

export const straightTone=(text:string)=>/schmerz|weh\b|druckstelle|drückt|sticht|notfall|atemnot|blutung|unfall|verschluck|absag|stornier|nicht.{0,30}(?:kommen|wahrnehmen)|rechnung|mahnung|zahlung|guthaben|bezahlt|payment|invoice|pain|cancel|dolor|factura/i.test(text);

export function replyVoiceViolations(text:string,register:Register,serious:boolean){
 const violations:string[]=[];
 if((register==='Sie'&&informal.test(text))||(register==='du'&&formal.test(text)))violations.push('salutation');
 const count=Array.from(graphemes.segment(text)).filter(part=>pictograph.test(part.segment)).length;
 if(count>(register==='du'&&!serious?1:0))violations.push('emoji');
 return violations;
}
