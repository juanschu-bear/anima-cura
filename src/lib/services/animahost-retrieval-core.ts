import {callbackDeadlineSentences,withoutCallbackDeadlines} from './animahost-no-deadlines';
import {repeatedReplySentences,matchedReplyRules,isInfoReplyRule,replySentences,patientReplyText} from './animahost-reply-quality';
import {renderWhatsAppRuleText} from './animahost-whatsapp';
import {removeKnownIdentityQuestions} from './animahost-identity-question';
import {parseBirthDate} from './animahost-chat-identity';
import {exemptReplyFinding} from './animahost-reply-boundaries';
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
 history:ConversationHistory;dossier:Dossier;patientSheet?:PatientSheet;chatName?:ChatNameContext;documents:RetrievalDocument[];rules:WhatsAppRule[];rulebookVersion?:number;rulebookCreatedAt?:string;teamTime:string;today:string;
 doctolibUrl:string|null;hasPriorConversation:boolean;hasPriorReply:boolean;identityAsked:boolean;clarificationRound?:number;receivedAt?:string;lastOutbound?:OutboundTurn;preview:boolean;budgetMs:number;deadline?:TeamDeadline|null;translated?:boolean;unreadable?:boolean;translationError?:ModelFailure;translation?:unknown};
export type RetrievalResult={action:'antworten'|'klaerfall'|'notfall';rule:string;text:string;skipSend?:boolean;teamSummary?:string|null;dueAt?:string;safeFallback?:boolean;reviewReasons?:string[];
 substantive:boolean;identityQuestion:boolean;retrieved:Record<RetrievalKind,RetrievalEvidence[]>;
 ms:number;repairs:number;violations:string[];excluded:boolean;error?:ModelFailure;anrede?:'du'|'Sie';clarificationStage?:1|2|3;checks?:unknown[];teamKind?:'info'|'act';disposition?:'vermerk';matchedRuleIds?:string[];usedRuleIds?:string[]};

export const systemTextPath='docs/animahost/2026-11-24-systemtext-v1.md';
export const systemText=readFileSync(join(process.cwd(),systemTextPath),'utf8');
export const retrievalDraft=z.string();
const hardKinds=['medical_advice','invented_appointment_or_cost','invoice_paid','confidential_unconfirmed','identity_known','forbidden_sentence','repetition'] as const;
const checked=z.object({passed:z.boolean(),hard:z.array(z.object({kind:z.enum(hardKinds),quote:z.string(),reason:z.string()})),teamRequired:z.boolean(),urgent:z.boolean(),summary:z.string().nullable(),usedRuleIds:z.array(z.string()).default([])});
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
 const matchedRules=matchedReplyRules(input.message,input.rules,input.history);
 const authoritative=new Map(input.rules.map(rule=>[rule.id,rule]));
 const docs=input.documents.filter(d=>!d.draft).map(d=>d.kind==='rule'&&authoritative.has(d.ref)?{...d,content:authoritative.get(d.ref)!.patientText}:d);
 for(const rule of matchedRules)if(!docs.some(d=>d.kind==='rule'&&d.ref===rule.id))docs.push({kind:'rule',ref:rule.id,version:input.rulebookVersion??0,source_at:input.rulebookCreatedAt??input.receivedAt??input.today,title:rule.topic,content:rule.patientText,payload:{},draft:false,content_hash:''});
 const selected={gold:docs.filter(d=>d.kind==='gold').slice(0,3),knowledge:docs.filter(d=>d.kind==='knowledge').slice(0,3),rule:docs.filter(d=>d.kind==='rule'),history:[] as RetrievalDocument[]};
 const at=new Date(input.receivedAt??Date.now());
 const infoRule=matchedRules.some(isInfoReplyRule)&&Boolean(renderWhatsAppRuleText('{doctolib_link}',input.doctolibUrl));
 const now={rueckmeldefristErlaubt:false,teamKind:infoRule?'info':'act',rueckmeldefrist:null,datum:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(at),uhrzeit:new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',timeStyle:'short'}).format(at),wochentag:new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',weekday:'long'}).format(at),sprechzeitenHeute:input.rules.filter(r=>/sprechzeit|öffnungszeit/i.test(r.patientText)).map(r=>r.patientText)};
 const fields:Record<string,unknown>={PATIENTENBLATT:{...(input.patientSheet?.context??{}),zuordnung:input.patientSheet?.access??'unlinked',bestaetigung:input.patientSheet?.verification??null,namensabgleich:input.chatName??null,gesprächsidentität:{eindeutig:input.chatName?.status==='matched',name:input.chatName?.matchedName??null,werSchreibt:input.chatName?.status==='matched'?input.chatName.matchedName:null,identitätsfrage:input.chatName?.status==='matched'?'bereits beantwortet':input.chatName?.question,erneuteNamensOderGeburtsdatumFrageNötig:input.chatName?.status!=='matched',vertraulicheAktenFreigegeben:input.patientSheet?.access==='confirmed',geburtsdatumMitgeteilt:/\[Datum\]/.test(input.message),fehlendeAngabenFürNamenszuordnung:input.chatName?.status==='matched'?[]:[input.chatName?.question??'Name']}},VORBILDER:selected.gold.map(d=>({anliegen:d.payload.question,antwort:typeof d.payload.answer==='string'?withoutCallbackDeadlines(d.payload.answer).text:d.payload.answer})),WISSEN:selected.knowledge.map(d=>({titel:d.title,inhalt:d.payload.content??d.content,...(d.payload.guidance as object??{})})),REGELN:selected.rule.map(d=>({referenz:d.ref,inhalt:d.content,verbindlich:matchedRules.some(r=>r.id===d.ref)})),VERLAUF:input.history.slice(-10),ÜBERSETZUNG:input.translation??null,JETZT:now,'Doctolib-Link':renderWhatsAppRuleText('{doctolib_link}',input.doctolibUrl)?'{doctolib_link}':'[kein freigegebener Buchungslink]'};
 // Never expose the configured booking URL in model context, including retrieved examples.
 const maskLinks=(value:string)=>value.replace(/https?:\/\/[^\s"'<>]+/gi,url=>/doctolib/i.test(url)||Boolean(input.doctolibUrl&&url.startsWith(input.doctolibUrl))?'{doctolib_link}':url);
 for(const key of Object.keys(fields))fields[key]=JSON.parse(maskLinks(JSON.stringify(fields[key])));
 const rendered=systemText.replace(/<(PATIENTENBLATT|VORBILDER|WISSEN|REGELN|VERLAUF|ÜBERSETZUNG|JETZT|Doctolib-Link)>/g,(_match,key)=>typeof fields[key]==='string'?String(fields[key]):JSON.stringify(fields[key]));
 return {system:rendered,fields,matchedRules,infoRule,deadline:now.rueckmeldefrist,selected,retrieved:Object.fromEntries(Object.entries(selected).map(([kind,rows])=>[kind,rows.map(evidence)])) as RetrievalResult['retrieved']};
}
export async function runRetrievalReply(generate:Generate,input:RetrievalInput):Promise<RetrievalResult>{
 const started=Date.now(),silent=retrievalPreflight(input);if(silent)return silent;
 const context=replyContext(input),checks:unknown[]=[];let hint:unknown=null,violations:string[]=[];
 for(let attempt=0;attempt<2;attempt++){
  try{
   let text=await generate({stage:'compose',system:context.system,prompt:JSON.stringify({nachricht:input.message.trim()==='[Datum]'?{art:'Antwort auf die Geburtsdatumsfrage',geburtsdatum:'mitgeteilt und für die Zuordnung ausgewertet; Wert nicht im Modelltext'}:input.message,nachrichtenart:input.messageType,...(hint?{prüferHinweis:hint}:{})}),schema:retrievalDraft,plainText:true,reasoning:'low',maxOutputTokens:3000,temperature:0.2,timeoutMs:Math.max(1000,input.budgetMs-(Date.now()-started))});
   const patientText=patientReplyText(text);text=patientText.text;
   const review=await generate({stage:'verify',system:'',prompt:JSON.stringify({auftrag:'Entscheide zuerst passed=true oder false. passed=true, wenn KEIN tatsächlicher harter Verstoß vorliegt; dann hard=[] (keine Hinweise, bestätigten Stellen oder vorsorglichen Bedenken eintragen). passed=false nur bei einem tatsächlich festgestellten Verstoß. Zulässige Aussagen dürfen niemals in hard stehen: belegte Termine aus dem Patientenblatt; Wünsche des Patienten als Wünsche; spontanes Kommen gemäß Praxisfakten; Selbsthilfe aus dem freigegebenen Systemtext einschließlich seiner Beispiele (Wachs, weiche Kost, gewohnte Schmerzmittel ohne Dosis, Teile aufheben, Schiene wie gewohnt tragen); Telefonkontakt, Hinweis auf Dringlichkeit und Verweis zur Abklärung an Kinderarzt oder Hausarzt ohne Diagnose oder Therapieempfehlung (kein medical_advice); angekündigte Teamprüfung ohne feste Terminzusage. Rückmeldefristen und zeitliche Zusagen der Praxis sind immer verboten (forbidden_sentence), auch in der ersten Antwort: keine Uhrzeit, kein heute/morgen/bald/zeitnah. Eine belegte Rechnungs-Mail wird bestätigt und über ihren vorhandenen Link geöffnet; keine erneute Zusendung anbieten, keine Rechnung per WhatsApp und keine unnötige Teamprüfung für diese reine Herkunftsfrage. invented_appointment_or_cost betrifft ausschließlich nicht belegte Behandlungstermine und Beträge. Ohne bestätigte Zuordnung sind Beträge, Zahlungsstände, Behandlungsinhalte, Behandlungstermine mit Datum und Dokumente aus der Akte gesperrt. Eine angekündigte Prüfung für eine namentlich genannte Person, der allgemeine Ablauf Freigabe → App → E-Mail und die Wiedergabe dessen, was der Absender selbst sieht, sind keine vertraulichen Daten. Prüfe ausschließlich harte Grenzen des Entwurfs: medizinischer Rat über die im Systemtext erlaubte Selbsthilfe hinaus; erfundene Termine oder Kosten; Rechnung als bezahlt erklärt; vertrauliche Daten ohne bestätigte Zuordnung; Identitätsfrage an bereits bekannten Patienten; ausdrücklich verbotene Sätze aus dem Systemtext; Wiederholungen bereits gesendeter AnimaHost-Sätze in VERLAUF, auch sinngemäß (kind=repetition): Rückmeldefrist zum selben Anliegen, 112-Hinweis, Buchungslink, Genesungswunsch und andere wiederholte Sätze. Auch neue Anliegen erlauben keine Rückmeldefrist. Verweise ohne Diagnose an Kinder- oder Hausarzt sind erlaubt. Jeder Verstoß braucht eine exakte Textstelle und einen Grund. Stil, Länge, Ton, Du/Sie, Struktur, Anzahl Fragen sind keine Ablehnungsgründe. teamRequired/urgent/summary sind nur Versand-/Teaminformationen und niemals Ablehnungsgründe. Eine angekündigte Teamprüfung ist möglich; keine bereits erledigte Handlung erfinden. Gib in usedRuleIds ausschließlich die referenz der REGELN an, deren Inhalt der Entwurf tatsächlich verwendet; bloß bereitgestellte oder nicht passende Regeln nicht aufzählen.',harteGrenzen:systemText.split('## Was du nie tust')[1].split('## Wann du still bist')[0],verboteneSätze:systemText.split('Du sagst nie ')[1].split('Du sprichst')[0],kontext:{PATIENTENBLATT:context.fields.PATIENTENBLATT,WISSEN:context.fields.WISSEN,REGELN:context.fields.REGELN,JETZT:context.fields.JETZT,VERLAUF:context.fields.VERLAUF},nachricht:input.message,entwurf:text}),schema:checked,reasoning:'none',maxOutputTokens:1500,temperature:0,timeoutMs:Math.max(1000,input.budgetMs-(Date.now()-started))});
   const callbackPromises=callbackDeadlineSentences(text);
   const deadlines:[]=[];
   const findings=review.passed?[]:review.hard.filter(v=>Boolean(v.quote)&&text.includes(v.quote));
   const namedBySender=[input.message,...input.history.filter(turn=>turn.direction==='incoming').map(turn=>turn.text)].join(' ');
   const exempted=findings.filter(v=>exemptReplyFinding(v.kind,v.quote,text,deadlines,namedBySender,input.message));
   const hard=findings.filter(v=>!exempted.includes(v)&&v.kind==='confidential_unconfirmed');
   const improvements=findings.filter(v=>!exempted.includes(v)&&v.kind!=='confidential_unconfirmed');
   const knownIdentity={name:input.chatName?.status==='matched',birthDate:[input.message,...input.history.filter(turn=>turn.direction==='incoming').map(turn=>turn.text)].some(value=>/\[Datum\]/.test(value)||Boolean(parseBirthDate(value)))};
   if(removeKnownIdentityQuestions(text,knownIdentity).removed.length)improvements.push({kind:'identity_known',quote:text,reason:'Die schreibende Person ist namentlich eindeutig zugeordnet. Keine erneute Namens- oder Geburtsdatumsfrage. Fehlende Freigabe vertraulicher Akten ist davon getrennt; darüber entscheidet das Team, nicht eine erneute Identitätsfrage.'});
   const repeats=repeatedReplySentences(text,input.history,input.message);
   for(const repeat of repeats)improvements.push({kind:'repetition',quote:repeat.quote,reason:'Bereits gesendet oder Folgeantwort zum selben Anliegen: '+repeat.kind+'. Diesen Satz entfernen.'});
   for(const violation of hardReplyViolations(text))if(!improvements.some(v=>v.kind==='forbidden_sentence'&&violation.includes(v.quote)))improvements.push({kind:'forbidden_sentence',quote:violation.slice('forbidden_sentence:'.length),reason:'Ausdrücklich verbotener Satzbaustein.'});
   const linkAlreadySent=input.history.some(h=>h.direction==='outgoing'&&h.source==='animahost'&&/doctolib|\{doctolib_link\}|\[Link\]/i.test(h.text));
   const requiresLink=!review.urgent&&context.infoRule&&context.matchedRules.some(r=>isInfoReplyRule(r)&&r.patientText.includes('{doctolib_link}'))&&!linkAlreadySent&&Boolean(renderWhatsAppRuleText('{doctolib_link}',input.doctolibUrl));
   const rawBookingUrl=/https?:\/\/[^\s]*doctolib[^\s]*/i.test(text)||Boolean(input.doctolibUrl&&text.includes(input.doctolibUrl));
   const invalidLink=rawBookingUrl||text.includes('{doctolib_link}')&&!renderWhatsAppRuleText(text,input.doctolibUrl);
   if(invalidLink||requiresLink&&!text.includes('{doctolib_link}'))improvements.push({kind:'forbidden_sentence',quote:text,reason:'Buchungsadresse nie selbst schreiben. Die passende Regel verlangt {doctolib_link}; nur der Code setzt die hinterlegte Adresse ein.'});
   for(const quote of callbackPromises)improvements.push({kind:'forbidden_sentence',quote,reason:'Keine Rückmeldefrist oder zeitliche Zusage für die Praxis. Antwort ohne Uhrzeit, Tag oder bald/zeitnah neu formulieren.'});
   const originalDraft=text;
   const cleaned=attempt===1&&hint?removeKnownIdentityQuestions(text,knownIdentity):{text,removed:[] as string[]};
   text=cleaned.text;
   const removedRepetitions:string[]=[];
   if(attempt===1)for(const finding of improvements.filter(v=>v.kind==='repetition'))for(const sentence of replySentences(text))if(sentence.includes(finding.quote)){text=text.replace(sentence,'');removedRepetitions.push(sentence);}

   const noDeadlines=attempt===1?withoutCallbackDeadlines(text):{text,removed:[] as string[]};
   text=noDeadlines.text;
   violations=hard.map(v=>v.kind+': '+v.reason);
   if(attempt===1){
    violations.push(...hardReplyViolations(text));
    if(invalidLink||requiresLink&&!originalDraft.includes('{doctolib_link}'))violations.push('booking_link_contract');
   }
   if(!text.trim())violations.push('empty_model_output');
   checks.push({attempt:attempt+1,draft:originalDraft,removedModelEnvelope:patientText.unwrapped,usedRuleIds:(review.usedRuleIds??[]).filter(id=>context.selected.rule.some(r=>r.ref===id)),...(cleaned.removed.length?{removedIdentityQuestions:cleaned.removed,finalText:text}:{}),removedRepetitions,removedCallbackDeadlines:noDeadlines.removed,passed:violations.length===0,hard,improvements,violations,...(exempted.length?{exempted}:{})});
   if(!violations.length&&improvements.length&&attempt===0){hint={entwurf:text,hinweise:improvements,zuordnung:context.fields.PATIENTENBLATT};continue;}
   if(!violations.length)return {...empty(),action:review.urgent?'notfall':review.teamRequired?'klaerfall':'antworten',rule:context.matchedRules.map(r=>r.id).join('|')||'systemtext-v1:answered',text:renderWhatsAppRuleText(text,input.doctolibUrl)??text,teamSummary:review.summary,teamKind:context.infoRule&&!review.urgent?'info':review.teamRequired?'act':undefined,...(context.infoRule&&!review.urgent?{action:'antworten' as const,disposition:'vermerk' as const}:{}),matchedRuleIds:context.matchedRules.map(r=>r.id),usedRuleIds:(review.usedRuleIds??[]).filter(id=>context.selected.rule.some(r=>r.ref===id)),dueAt:undefined,substantive:true,retrieved:context.retrieved,ms:Date.now()-started,repairs:attempt,reviewReasons:[],checks};
   hint={entwurf:text,verstöße:violations};
  }catch(error){violations=['technical_failure:'+(error instanceof Error?error.name:'unknown')];checks.push({attempt:attempt+1,violations});hint={prüferHinweis:violations};}
 }
 return {...empty(),action:'klaerfall',rule:'chain:guard_rejected',text:'',skipSend:true,teamSummary:violations.join('; '),violations,reviewReasons:violations,retrieved:context.retrieved,ms:Date.now()-started,repairs:1,checks};
}
