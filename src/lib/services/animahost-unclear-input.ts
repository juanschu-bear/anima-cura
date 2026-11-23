/** Conversation clarification only: never opens links or interprets codes as patient facts. */
export function unclearInput(message:string,messageType:string){
 const text=message.trim();
 if(messageType==='sticker')return 'sticker';
 if(/^(?:https?:\/\/|www\.)\S+(?:\s+(?:https?:\/\/|www\.)\S+)*$/i.test(text))return 'link';
 if(/^(?:huhu|hallo|hi|hey|guten (?:morgen|tag|abend))[!,.\s]*$/i.test(text))return 'greeting';
 if(/^\d{3,}$/.test(text))return 'code';
 if(/^(?:ich wollte|ich habe|könnten sie|kann ich|wegen|also|und dann)[\s.…]*$/i.test(text))return 'fragment';
 if(text&& !new RegExp('[\\p{L}\\p{N}]','u').test(text))return 'signal';
 return null;
}
export function unclearReply(input:{kind:string;round:number;name?:string;teamTime:string;at?:string}){
 const name=input.name?.trim();
 if(input.round>=2)return {action:'klaerfall' as const,rule:'conversation:outside_scope',text:`Ich komme hier noch nicht ganz mit. Ich gebe unseren Austausch ans Praxisteam weiter, damit wir gemeinsam herausfinden, was Sie brauchen. Das Team meldet sich ${input.teamTime} bei Ihnen.`,teamSummary:'Nach zwei Nachfragen bleibt das Anliegen unklar. Bitte den bisherigen Austausch prüfen.'};
 if(input.round===1)return {action:'antworten' as const,rule:'conversation:clarify_second',text:'Ich steh noch auf dem Schlauch, aber ich bin offen für Neues: Schreiben Sie mir einfach in 1 Satz, was Sie brauchen, dann kümmere ich mich.'};
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date(input.at??Date.now())));
 const greeting=hour<11?'Guten Morgen':hour<18?'Guten Tag':'Guten Abend';
 const text=input.kind==='link'?`${greeting}${name?' '+name:''}, da ist nur ein Link bei mir angekommen und ich öffne von mir aus nichts Fremdes. Erzählen Sie mir kurz, worum es geht? Ich bin ganz Ohr.`:
 `${input.kind==='greeting'?'Huhu zurück!':'Da fehlt mir noch ein kleines Puzzlestück.'}${name?' '+name+', schön':' Schön'}, dass Sie schreiben. Was kann ich für Sie tun, geht es um einen Termin, die Spange oder etwas ganz anderes?`;
 return {action:'antworten' as const,rule:'conversation:clarify_first',text};
}
/** Count only delivered clarification texts in the supplied chat, reset by a substantive answer. */
export function clarificationRound(prior:Array<{rule_id:string;patient_text?:string}>,history:Array<{direction:string;text:string}>){
 const sent=new Set(history.filter(h=>h.direction==='outgoing').map(h=>h.text.trim()));let round=0;
 for(const row of prior){if(!row.patient_text||!sent.has(row.patient_text.trim()))continue;
  if(!/^conversation:clarify_(first|second)$/.test(row.rule_id))break;round++;}
 return Math.min(2,round);
}
