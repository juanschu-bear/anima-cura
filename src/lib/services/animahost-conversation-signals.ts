// This wire policy also runs at the WhatsApp transport before an answer can be attempted.
const emoji=new RegExp(String.raw`(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)(?:[\u{E0020}-\u{E007F}]*)`,'gu');
const acknowledgments=/^(?:danke(?: schön| sehr)?|dankeschön|vielen dank|besten dank|lieben dank|ok(?:ay)?|alles klar|in ordnung|passt|passt so|verstanden|super|perfekt|prima|danke,? (?:alles klar|passt)|thanks(?: a lot)?|thank you|all right|got it|great|gracias|muchas gracias|vale|de acuerdo|entendido)$/;

export function socialReply(input:{messageType:string;text:string|null;hasPriorConversation:boolean;hasPriorReply:boolean}){
 const type=input.messageType.replace(/^view_once_/,'');
 const text=(input.text??'').trim();
 if(type==='reaction')return 'social:reaction';
 if(type==='unsupported'&&!text)return 'social:unreadable';
 if(type==='sticker'&&!text)return input.hasPriorConversation?'social:acknowledged':'begruessung-ohne-anliegen';
 if(type!=='text'&&type!=='unsupported')return null;
 const stripped=text.replace(emoji,'');
 const words=stripped.replace(/[\u200D\uFE0F]/g,'').trim();
 if(text!==stripped&&!words)return input.hasPriorConversation?'social:acknowledged':'begruessung-ohne-anliegen';
 if(input.hasPriorReply&&acknowledgments.test(words.toLocaleLowerCase('de-DE').replace(/[.!?,…]+$/,'').replace(/\s+/g,' ').trim()))
  return 'social:acknowledged';
 return null;
}

export const silentSocialRule=/^social:(?:reaction|unreadable|acknowledged)$/;
