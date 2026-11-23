// This wire policy also runs at the WhatsApp transport before an answer can be attempted.
const emoji=new RegExp(String.raw`(?:\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)(?:[\u{E0020}-\u{E007F}]*)`,'gu');
const acknowledgments=/^(?:danke(?: schön| sehr)?|dankeschön|vielen dank|besten dank|lieben dank|ok(?:ay)?|alles klar|in ordnung|passt|passt so|verstanden|super|perfekt|prima|danke,? (?:alles klar|passt)|thanks(?: a lot)?|thank you|all right|got it|great|gracias|muchas gracias|vale|de acuerdo|entendido)$/;

const closing=/(?:^|[.!?,…]\s*|\s+)(?:(?:ich wünsche ihnen (?:noch )?)?(?:einen |ein |noch einen |noch ein )?)?(?:schönen (?:abend|tag)|schönes wochenende|bis bald|bis dann|ihnen auch)[.!?,…\s]*$/i;
function acknowledgmentWords(text:string){
 const original=text.toLocaleLowerCase('de-DE').trim();
 const value=original.replace(closing,'').replace(/[.!?,…]+$/,'').trim();
 if(value!==original&&!value)return 'danke';
 return value.replace(/ für (?:ihre |die |eure )?(?:hilfe|antwort|rückmeldung|information(?:en)?|info)$/,'').replace(/\s+/g,' ').trim();
}

export function socialReply(input:{messageType:string;text:string|null;hasPriorConversation:boolean;hasPriorReply:boolean}){
 const type=input.messageType.replace(/^view_once_/,'');
 const text=(input.text??'').trim();
 if(type==='reaction')return 'social:reaction';
 if(['unsupported','text','system','protocol','edit'].includes(type)&&!text)return 'social:unreadable';
 if(type==='sticker'&&!text)return input.hasPriorConversation?'social:acknowledged':'begruessung-ohne-anliegen';
 if(type!=='text'&&type!=='unsupported')return null;
 const stripped=text.replace(emoji,'');
 const words=stripped.replace(/[\u200D\uFE0F]/g,'').trim();
 if(text!==stripped&&!words)return input.hasPriorConversation?'social:acknowledged':'begruessung-ohne-anliegen';
 if(acknowledgments.test(acknowledgmentWords(words)))
  return 'social:acknowledged';
 return null;
}

export const silentSocialRule=/^social:(?:reaction|unreadable|acknowledged)$/;
