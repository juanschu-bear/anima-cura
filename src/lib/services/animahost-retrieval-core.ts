import {approvedDeadlineMatches,deadlineContext,exemptReplyFinding} from './animahost-reply-boundaries';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
import type {ChatNameContext} from './animahost-name-match';
import type {PatientSheet} from './animahost-patient-sheet';
import type {TeamDeadline} from './animahost-team-time';
import type {ModelFailure} from './animahost-model-failure';
import type {OutboundTurn} from './animahost-retrieval-routing';
import type {Dossier} from './animahost-dossier';
import type {WhatsAppRule} from './animahost-whatsapp';
import type {ConversationHistory} from './animahost-whatsapp-conversation';
import type {Generate} from './animahost-chain';
import {evidence,type RetrievalDocument,type RetrievalEvidence,type RetrievalKind} from './animahost-retrieval';
export type RetrievalInput={message:string;messageType:string;jid:string;phone:string|null;practicePhone:string|null;teamPhones?:string;nonPatientPhones?:string;
 history:ConversationHistory;dossier:Dossier;patientSheet?:PatientSheet;chatName?:ChatNameContext;documents:RetrievalDocument[];rules:WhatsAppRule[];teamTime:string;today:string;
 doctolibUrl:string|null;hasPriorConversation:boolean;hasPriorReply:boolean;identityAsked:boolean;clarificationRound?:number;receivedAt?:string;lastOutbound?:OutboundTurn;preview:boolean;budgetMs:number;deadline?:TeamDeadline|null;translated?:boolean;unreadable?:boolean;translationError?:ModelFailure;translation?:unknown};
export type RetrievalResult={action:'antworten'|'klaerfall'|'notfall';rule:string;text:string;skipSend?:boolean;teamSummary?:string|null;dueAt?:string;safeFallback?:boolean;reviewReasons?:string[];
 substantive:boolean;identityQuestion:boolean;retrieved:Record<RetrievalKind,RetrievalEvidence[]>;
 ms:number;repairs:number;violations:string[];excluded:boolean;error?:ModelFailure;anrede?:'du'|'Sie';clarificationStage?:1|2|3;checks?:unknown[]};

export const systemTextPath='docs/animahost/2026-11-24-systemtext-v1.md';
export const systemText=readFileSync(join(process.cwd(),systemTextPath),'utf8');
export const retrievalDraft=z.string();
const hardKinds=['medical_advice','invented_appointment_or_cost','invoice_paid','confidential_unconfirmed','identity_known','forbidden_sentence'] as const;
const checked=z.object({passed:z.boolean(),hard:z.array(z.object({kind:z.enum(hardKinds),quote:z.string(),reason:z.string()})),teamRequired:z.boolean(),urgent:z.boolean(),summary:z.string().nullable()});
const emptyRetrieval=():RetrievalResult['retrieved']=>({gold:[],knowledge:[],rule:[],history:[]});
const empty=()=>({retrieved:emptyRetrieval(),ms:0,repairs:0,violations:[],substantive:false,identityQuestion:false,excluded:false});
export function hardReplyViolations(text:string){
 const forbidden=systemText.split('Du sagst nie ')[1]?.split('Du sprichst')[0]??'';
 return Array.from(forbidden.matchAll(/„([^“]+)“/g)).filter(m=>text.toLocaleLowerCase('de').includes(m[1].toLocaleLowerCase('de'))).map(m=>'forbidden_sentence:'+m[1]);
}
export function retrievalPreflight(input:RetrievalInput):RetrievalResult|null{
 const value=input.message.trim();
 const quiet=input.messageType==='reaction'||/^(?:danke(?: schön| sehr)?|vielen dank|dankeschön|ok(?:ay)?|👍|❤️|❤)[.!\s]*$/i.test(value)||new RegExp('^[\\p{L}]+\\*$','u').test(value);
 if(quiet)return {...empty(),action:'antworten',rule:'social:acknowledged',text:'',skipSend:true};
 const last=input.lastOutbound??input.history.filter(h=>h.direction==='outgoing').map(h=>({source:h.source,at:h.at})).at(-1);
 const age=last?Date.parse(input.receivedAt??new Date().toISOString())-Date.parse(last.at):Infinity;
 if(last?.source==='practice'&&age>=0&&age<=86400000)return {...empty(),action:'antworten',rule:'conversation:practice_reply',text:'',skipSend:true};
 return null;
}
export function replyContext(input:RetrievalInput){
 const docs=input.documents.filter(d=>!d.draft);
 const selected={gold:docs.filter(d=>d.kind==='gold').slice(0,3),knowledge:docs.filter(d=>d.kind==='knowledge').slice(0,3),rule:docs.filter(d=>d.kind==='rule'),history:[] as RetrievalDocument[]};
 const at=new Date(input.receivedAt??Date.now());
 const now={rueckmeldefrist:deadlineContext(input.deadline,at),datum:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(at),uhrzeit:new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',timeStyle:'short'}).format(at),wochentag:new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'long'}).format(at),sprechzeitenHeute:input.rules.filter(r=>/sprechzeit|öffnungszeit/i.test(r.patientText)).map(r=>r.patientText)};
 const fields:Record<string,unknown>={PATIENTENBLATT:{...(input.patientSheet?.context??{}),zuordnung:input.patientSheet?.access??'unlinked',bestaetigung:input.patientSheet?.verification??null,namensabgleich:input.chatName??null,gesprächsidentität:{eindeutig:input.chatName?.status==='matched',name:input.chatName?.matchedName??null,werSchreibt:input.chatName?.status==='matched'?input.chatName.matchedName:null,identitätsfrage:input.chatName?.status==='matched'?'bereits beantwortet':input.chatName?.question,erneuteNamensOderGeburtsdatumFrageNötig:input.chatName?.status!=='matched',vertraulicheAktenFreigegeben:input.patientSheet?.access==='confirmed',geburtsdatumMitgeteilt:/\[Datum\]/.test(input.message),fehlendeAngabenFürNamenszuordnung:input.chatName?.status==='matched'?[]:[input.chatName?.question??'Name']}},VORBILDER:selected.gold.map(d=>({anliegen:d.payload.question,antwort:d.payload.answer})),WISSEN:selected.knowledge.map(d=>({titel:d.title,inhalt:d.payload.content??d.content,...(d.payload.guidance as object??{})})),REGELN:selected.rule.map(d=>({referenz:d.ref,inhalt:d.content})),VERLAUF:input.history.slice(-10),ÜBERSETZUNG:input.translation??null,JETZT:now,'Doctolib-Link':input.doctolibUrl??'[kein freigegebener Buchungslink]'};
 const rendered=systemText.replace(/<(PATIENTENBLATT|VORBILDER|WISSEN|REGELN|VERLAUF|ÜBERSETZUNG|JETZT|Doctolib-Link)>/g,(_match,key)=>typeof fields[key]==='string'?String(fields[key]):JSON.stringify(fields[key]));
 return {system:rendered,fields,deadline:now.rueckmeldefrist,selected,retrieved:Object.fromEntries(Object.entries(selected).map(([kind,rows])=>[kind,rows.map(evidence)])) as RetrievalResult['retrieved']};
}
export async function runRetrievalReply(generate:Generate,input:RetrievalInput):Promise<RetrievalResult>{
 const started=Date.now(),silent=retrievalPreflight(input);if(silent)return silent;
 const context=replyContext(input),checks:unknown[]=[];let hint:unknown=null,violations:string[]=[];
 for(let attempt=0;attempt<2;attempt++){
  try{
   const text=await generate({stage:'compose',system:context.system,prompt:JSON.stringify({nachricht:input.message.trim()==='[Datum]'?{art:'Antwort auf die Geburtsdatumsfrage',geburtsdatum:'mitgeteilt und für die Zuordnung ausgewertet; Wert nicht im Modelltext'}:input.message,nachrichtenart:input.messageType,...(hint?{prüferHinweis:hint}:{})}),schema:retrievalDraft,plainText:true,reasoning:'low',maxOutputTokens:3000,temperature:0.2,timeoutMs:Math.max(1000,input.budgetMs-(Date.now()-started))});
   const review=await generate({stage:'verify',system:'',prompt:JSON.stringify({auftrag:'Entscheide zuerst passed=true oder false. passed=true, wenn KEIN tatsächlicher harter Verstoß vorliegt; dann hard=[] (keine Hinweise, bestätigten Stellen oder vorsorglichen Bedenken eintragen). passed=false nur bei einem tatsächlich festgestellten Verstoß. Zulässige Aussagen dürfen niemals in hard stehen: belegte Termine aus dem Patientenblatt; Wünsche des Patienten als Wünsche; spontanes Kommen gemäß Praxisfakten; Selbsthilfe aus dem freigegebenen Systemtext einschließlich seiner Beispiele (Wachs, weiche Kost, gewohnte Schmerzmittel ohne Dosis, Teile aufheben, Schiene wie gewohnt tragen); Telefonkontakt und Hinweis auf Dringlichkeit ohne Diagnose; angekündigte Teamprüfung ohne feste Terminzusage. Eine Rückmeldefrist aus JETZT.rueckmeldefrist ist immer erlaubt, ausdrücklich auch „Sie hören heute bis 17 Uhr von uns“, wenn dort 17 Uhr steht. invented_appointment_or_cost betrifft ausschließlich nicht belegte Behandlungstermine und Beträge. Ohne bestätigte Zuordnung sind Beträge, Zahlungsstände, Behandlungsinhalte, Behandlungstermine mit Datum und Dokumente aus der Akte gesperrt. Eine angekündigte Prüfung für eine namentlich genannte Person, eine Rückmeldefrist, der allgemeine Ablauf Freigabe → App → E-Mail und die Wiedergabe dessen, was der Absender selbst sieht, sind keine vertraulichen Daten. Prüfe ausschließlich harte Grenzen des Entwurfs: medizinischer Rat über die im Systemtext erlaubte Selbsthilfe hinaus; erfundene Termine oder Kosten; Rechnung als bezahlt erklärt; vertrauliche Daten ohne bestätigte Zuordnung; Identitätsfrage an bereits bekannten Patienten; ausdrücklich verbotene Sätze aus dem Systemtext. Jeder Verstoß braucht eine exakte Textstelle und einen Grund. Stil, Länge, Ton, Du/Sie, Struktur, Anzahl Fragen und Fristen sind keine Ablehnungsgründe. teamRequired/urgent/summary sind nur Versand-/Teaminformationen und niemals Ablehnungsgründe. Eine angekündigte Teamprüfung ist möglich; keine bereits erledigte Handlung erfinden.',harteGrenzen:systemText.split('## Was du nie tust')[1].split('## Wann du still bist')[0],verboteneSätze:systemText.split('Du sagst nie ')[1].split('Du sprichst')[0],kontext:{PATIENTENBLATT:context.fields.PATIENTENBLATT,WISSEN:context.fields.WISSEN,REGELN:context.fields.REGELN,JETZT:context.fields.JETZT},nachricht:input.message,entwurf:text}),schema:checked,reasoning:'none',maxOutputTokens:1500,temperature:0,timeoutMs:Math.max(1000,input.budgetMs-(Date.now()-started))});
   const deadlines=approvedDeadlineMatches(text,context.deadline);
   const findings=review.passed?[]:review.hard.filter(v=>Boolean(v.quote)&&text.includes(v.quote));
   const namedBySender=[input.message,...input.history.filter(turn=>turn.direction==='incoming').map(turn=>turn.text)].join(' ');
   const exempted=findings.filter(v=>exemptReplyFinding(v.kind,v.quote,text,deadlines,namedBySender,input.message));
   const hard=findings.filter(v=>!exempted.includes(v)&&v.kind==='confidential_unconfirmed');
   const improvements=findings.filter(v=>!exempted.includes(v)&&v.kind!=='confidential_unconfirmed');
   if(input.chatName?.status==='matched'&&/(?:bitte|können Sie|kannst du|wie lautet)[^.!?]*(?:Geburtsdatum|vollen Namen|wer[^.!?]*schreibt)|(?:nennen|schicken|senden|schreiben|verraten|fehlt)[^.!?]*(?:Geburtsdatum|vollen Namen)/i.test(text))improvements.push({kind:'identity_known',quote:text,reason:'Die schreibende Person ist namentlich eindeutig zugeordnet. Keine erneute Namens- oder Geburtsdatumsfrage. Fehlende Freigabe vertraulicher Akten ist davon getrennt; darüber entscheidet das Team, nicht eine erneute Identitätsfrage.'});
   violations=hard.map(v=>v.kind+': '+v.reason);
   if(!text.trim())violations.push('empty_model_output');
   checks.push({attempt:attempt+1,draft:text,passed:violations.length===0,hard,improvements,violations,...(exempted.length?{exempted}:{})});
   if(!violations.length&&improvements.length&&attempt===0){hint={entwurf:text,hinweise:improvements,zuordnung:context.fields.PATIENTENBLATT};continue;}
   if(!violations.length)return {...empty(),action:review.urgent?'notfall':review.teamRequired||deadlines.length?'klaerfall':'antworten',rule:'systemtext-v1:answered',text,teamSummary:review.summary,dueAt:deadlines.length?context.deadline?.dueAt:undefined,substantive:true,retrieved:context.retrieved,ms:Date.now()-started,repairs:attempt,reviewReasons:[],checks};
   hint={entwurf:text,verstöße:violations};
  }catch(error){violations=['technical_failure:'+(error instanceof Error?error.name:'unknown')];checks.push({attempt:attempt+1,violations});hint={prüferHinweis:violations};}
 }
 return {...empty(),action:'klaerfall',rule:'chain:guard_rejected',text:'',skipSend:true,teamSummary:violations.join('; '),violations,reviewReasons:violations,retrieved:context.retrieved,ms:Date.now()-started,repairs:1,checks};
}
