import {replySentences} from './animahost-reply-quality';
export type CompletedAction={kind:'team_note'|'appointment_change'|'account_update'|'document_send';patientId:string;at:string;reference:string;statement:string};
const past=/\b(?:ich habe|wir haben|habe ich|haben wir)\b[^.!?]{0,180}\b(?:weitergegeben|weitergeleitet|informiert|vermerkt|notiert|zugeordnet|angepasst|verschoben|abgesagt|storniert|gebucht|freigeschaltet|versandt|verschickt|gesendet)\b/i;
const teamDone=/\b(?:das (?:Praxis)?team weiß Bescheid|(?:das |unser )?(?:Praxis)?team (?:ist|wurde) informiert|dem (?:Praxis)?team liegt [^.!?]{1,80} vor)\b/i;
const handoff=/\b(?:ich|wir)\s+(?:leite[n]?|gebe[n]?|reiche[n]?)\b[^.!?]{0,100}(?:ans? (?:Praxis)?team|an das (?:Praxis)?team|weiter)\b/i;
const promise=/\b(?:wir|ich)\s+(?:verschieben?|buche[n]?|stornier\w*|sag\w*[^.!?]{0,45}\bab|pass\w*[^.!?]{0,45}\ban)\b/i;
/** Only server-supplied, patient-scoped receipts establish that this assistant performed an action. */
export function unsupportedActionClaims(text:string,receipts:CompletedAction[]=[],patientId?:string,at?:string){
 return replySentences(text).flatMap(quote=>{
  const completed=past.exec(quote);
  if(completed&&/\b(?:nicht|keinen?|nie)\b/i.test(completed[0]))return [];
  if(!completed&&!promise.test(quote)&&!teamDone.test(quote)&&!handoff.test(quote))return [];
  const kind:CompletedAction['kind']=/verschob|verschieb|gebucht|buche|abgesagt|stornier|angepasst|passen/i.test(quote)?'appointment_change':/freigeschaltet|zugeordnet/i.test(quote)?'account_update':/versandt|verschickt|gesendet/i.test(quote)?'document_send':'team_note';
  const proven=Boolean(patientId&&at&&receipts.some(r=>r.kind===kind&&r.patientId===patientId&&r.reference.trim()&&r.statement.trim()===quote.trim()&&Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)<=Date.parse(at)));
  return proven?[]:[{kind:'unsupported_action' as const,quote,reason:'Keine ausgeführte Handlung belegt. Nicht behaupten, etwas bereits vermerkt, weitergegeben, zugeordnet oder geändert zu haben; den tatsächlich möglichen nächsten Schritt beschreiben.'}];
 });
}
