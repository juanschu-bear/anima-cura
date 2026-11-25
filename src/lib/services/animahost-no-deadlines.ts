import {replySentences} from './animahost-reply-quality';
/** Patient-facing callback/service promises only: appointment times and recorded dispatch dates remain facts. */
export function callbackDeadlineSentences(text:string){
 const when=/\b(?:heute|morgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|werktag\w*|nächste\w*|diese\w* (?:Woche|Tag)|im Laufe|bis Ende|Wochenende|spätestens|innerhalb|Uhr|bald|zeitnah|umgehend|demnächst|gleich|sofort|in Kürze|today|tomorrow|monday|tuesday|wednesday|thursday|friday|soon|shortly|within|\d+\s*(?:Stunden|Minuten|Tagen|hours|minutes|days))\b|\b(?:bis|um|gegen|by|at|am|on)\s+\d{1,2}[.:]?/i;
 const callback=/\b(?:Rückmeld\w*|rückruf\w*|meld\w* (?:sich|uns|mich)|(?:prüft|klärt|schaut|antwortet)[^.!?]{0,60}das (?:Praxis[- ]?)?team|Sie hören|du hörst|hören Sie|hörst du|(?:wir|das (?:Praxis[- ]?)?team)\b[^.!?]{0,100}\b(?:meld\w*|prüf\w*|klär\w*|schau\w*|sicht\w*|bearbeit\w*|kümmer\w*|antwort\w*|geben|schicken|senden)|(?:meld\w*|antwort\w*)\b[^.!?]{0,70}\b(?:bei Ihnen|bei dir)|(?:Sie|du) (?:erhalten|bekommen|erhältst|bekommst)[^.!?]{0,70}(?:Antwort|Bescheid|Unterlagen|Bestätigung|Rechnung)|(?:we|our team)\b[^.!?]{0,80}\b(?:reply|respond|contact|check|get back)|(?:you(?:'ll| will) (?:hear|receive))|response|callback)\b/i;
 return replySentences(text).filter(sentence=>when.test(sentence)&&callback.test(sentence));
}
export function withoutCallbackDeadlines(text:string){
 const removed=callbackDeadlineSentences(text);
 if(!removed.length)return {text,removed};
 let clean=text;for(const sentence of removed)clean=clean.replace(sentence,'');
 return {text:clean.replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim(),removed};
}
