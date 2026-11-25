import {appointmentFlowMistakes} from './animahost-appointment-flow-check';
import {contradictoryFindings} from './animahost-review-consistency';
import {unsupportedActionClaims,type CompletedAction} from './animahost-action-evidence';
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
export type RetrievalInput={completedActions?:CompletedAction[];message:string;messageType:string;jid:string;phone:string|null;practicePhone:string|null;teamPhones?:string;nonPatientPhones?:string;
 history:ConversationHistory;dossier:Dossier;patientSheet?:PatientSheet;chatName?:ChatNameContext;documents:RetrievalDocument[];rules:WhatsAppRule[];rulebookVersion?:number;rulebookCreatedAt?:string;teamTime:string;today:string;
 doctolibUrl:string|null;hasPriorConversation:boolean;hasPriorReply:boolean;identityAsked:boolean;clarificationRound?:number;receivedAt?:string;lastOutbound?:OutboundTurn;preview:boolean;budgetMs:number;deadline?:TeamDeadline|null;translated?:boolean;unreadable?:boolean;translationError?:ModelFailure;translation?:unknown};
export type RetrievalResult={action:'antworten'|'klaerfall'|'notfall';rule:string;text:string;skipSend?:boolean;teamSummary?:string|null;dueAt?:string;safeFallback?:boolean;reviewReasons?:string[];
 substantive:boolean;identityQuestion:boolean;retrieved:Record<RetrievalKind,RetrievalEvidence[]>;
 ms:number;repairs:number;violations:string[];excluded:boolean;error?:ModelFailure;anrede?:'du'|'Sie';clarificationStage?:1|2|3;checks?:unknown[];teamKind?:'info'|'act';disposition?:'vermerk';matchedRuleIds?:string[];usedRuleIds?:string[]};

export const systemTextPath='docs/animahost/2026-11-24-systemtext-v1.md';
export const systemText=readFileSync(join(process.cwd(),systemTextPath),'utf8');
export const retrievalDraft=z.string();
const hardKinds=['medical_advice','invented_appointment_or_cost','invoice_paid','confidential_unconfirmed','identity_known','forbidden_sentence','repetition','appointment_flow','unsupported_action'] as const;
const checked=z.object({passed:z.boolean(),hard:z.array(z.object({kind:z.enum(hardKinds),quote:z.string(),reason:z.string()})),teamRequired:z.boolean(),urgent:z.boolean(),summary:z.string().nullable(),usedRuleIds:z.array(z.string()).default([]),lateness:z.enum(['none','clarify','within','reschedule','exception']).default('none')});
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
 const fields:Record<string,unknown>={PATIENTENBLATT:{...(input.patientSheet?.context??{}),zuordnung:input.patientSheet?.access??'unlinked',bestaetigung:input.patientSheet?.verification??null,namensabgleich:input.chatName??null,gesprächsidentität:{eindeutig:input.chatName?.status==='matched',name:input.chatName?.matchedName??null,werSchreibt:input.chatName?.status==='matched'&&input.chatName.role!=='subject'?input.chatName.matchedName:null,betroffenerPatient:input.chatName?.role==='subject'?input.chatName.matchedName:null,identitätsfrage:input.chatName?.status==='matched'?'bereits beantwortet':input.chatName?.question,erneuteNamensOderGeburtsdatumFrageNötig:input.chatName?.status!=='matched',vertraulicheAktenFreigegeben:input.patientSheet?.access==='confirmed',geburtsdatumMitgeteilt:/\[Datum\]/.test(input.message),fehlendeAngabenFürNamenszuordnung:input.chatName?.status==='matched'?[]:[input.chatName?.question??'Name']}},VORBILDER:selected.gold.map(d=>({anliegen:d.payload.question,antwort:typeof d.payload.answer==='string'?withoutCallbackDeadlines(d.payload.answer).text:d.payload.answer})),WISSEN:selected.knowledge.map(d=>({titel:d.title,inhalt:d.payload.content??d.content,...(d.payload.guidance as object??{})})),REGELN:selected.rule.map(d=>({referenz:d.ref,inhalt:d.content,verbindlich:matchedRules.some(r=>r.id===d.ref)})),VERLAUF:input.history.slice(-10),ÜBERSETZUNG:input.translation??null,JETZT:{...now,ausgeführteAktionen:input.completedActions??[]},'Doctolib-Link':renderWhatsAppRuleText('{doctolib_link}',input.doctolibUrl)?'{doctolib_link}':'[kein freigegebener Buchungslink]'};
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
   const verifyPrompt={auftrag:`Prüfe den Entwurf gegen die mitgelieferten Quellen. Gib nur tatsächliche Verstöße mit exakter Textstelle in hard aus. Ist hard leer, passed=true; sonst passed=false. Keine Hinweise, Verbesserungswünsche oder Erklärungen zulässiger Stellen in hard. Ein Grund darf nicht zugleich einen Verstoß behaupten und verneinen. Prüfe die konkrete Aussage, nicht nur das Thema.
Zulässig ohne bestätigte Akte: vom Absender selbst genannte Namen/Daten wiedergeben, allgemeine Praxisabläufe erklären, eine nötige Teamprüfung ohne Frist ankündigen, Rückfragen nach wirklich fehlenden Angaben. Eine Bitte um Prüfung ist kein Akteninhalt. Eine Frage nach dem vom Absender gemeinten Begriff oder dem Inhalt seines eigenen Zettels legt keine Akteninformation offen. Ein Fachbegriff wie Abdruck/Abformung ohne Diagnose oder Therapieanweisung ist kein medical_advice. Ein Datum oder Name, das der Absender selbst nennt, ist keine neue Offenlegung aus der Akte. Keine Vermutungen über eine mögliche Verletzung als tatsächlichen Verstoß ausgeben. Allgemeiner Rechnungsversand bedeutet nicht, dass die konkrete Rechnung bereits existiert. Ein Kinder-/Hausarztverweis ohne Diagnose/Therapie ist kein medical_advice. Selbsthilfe gemäß Systemtext ist erlaubt.
Harte Grenzen: medical_advice (nicht freigegebene Diagnose/Therapie); invented_appointment_or_cost (unbelegter Behandlungstermin/Betrag); invoice_paid (Rechnung als bezahlt erklärt); confidential_unconfirmed (konkrete vertrauliche Akteninformation trotz fehlender Freigabe); unsupported_action (erledigte eigene Handlung oder verbindliche Buchung ohne Ausführungsnachweis in JETZT.ausgeführteAktionen); identity_known (bereits bekannte Angabe erneut erfragt); forbidden_sentence (ausdrücklich verbotener Satz oder Rückmeldefrist); repetition (bereits gesendete AnimaHost-Aussage, auch sinngemäß).
Teamprüfung ohne Rückmeldefrist ist erlaubt. Behandlungstermine, Sprechzeiten, Versanddaten und Verspätungsminuten sind Fakten, keine Rückmeldefristen. Verboten sind neue Zusagen zur Rückmeldung/Bearbeitung bis zu einer Uhrzeit, heute/morgen/bald/zeitnah. Alte Zusagen im Verlauf berechtigen nicht zu neuen. Eine belegte bereits erhaltene Rechnungs-Mail bestätigen; weder erneuten Versand noch WhatsApp-Rechnung anbieten.
Verspätung: lateness=clarify, wenn die Minuten nach dem vereinbarten Termin unbekannt sind; within bis einschließlich 15 Minuten; reschedule über 15 Minuten ohne Ausnahmebitte; exception bei begründeter Bitte um Ausnahmeentscheidung; sonst none. Wettkampfende ist keine Ankunftszeit. Eine einzelne Ankunftszeit ohne Terminzeit bestimmt keine Verspätung. Eine ausdrückliche Terminabsage/-verschiebung ohne Verspätungsfrage ist none. Nutze Nachricht UND Verlauf, besonders kurze Antworten wie „20 Minuten“.
appointment_flow nur bei einem tatsächlich falschen Schritt: Zusage/Link vor der Minutenklärung; unnötige Identitäts-/Terminzeitfrage statt Minutenfrage; Minuten erneut erfragen; Link innerhalb der Toleranz; zusätzliche Buchung statt bestehendem Termin im eigenen Konto verschieben; eigenmächtige Ausnahmeentscheidung. Eine Erklärung der 15-Minuten-Toleranz auch bei größerer Verspätung ist erlaubt. Keine Wortlautpflicht; fehlende einzelne Begründungswörter oder mögliche Wartezeit sind kein Verstoß. Die Ausnahmeentscheidung benötigt teamRequired=true, normale Minutenklärung/Toleranz/Selbstverschiebung nicht. Andere Anliegen in derselben Nachricht getrennt beachten.
Fragen nur bei einer entscheidenden Wissenslücke. Nutze vorhandene Quellen; ein im Kontext maskiertes Geburtsdatum gilt als mitgeteilt, nicht als fehlend. Kurze Antworten auf die letzte Frage weiterverarbeiten. Keine wiederholte Empathie, Links, Notrufhinweise oder Identitätsfragen. Nur tatsächlich verwendete Regelreferenzen in usedRuleIds. Ton, Länge, Du/Sie oder bloße Stilvorlieben nicht ablehnen.`,harteGrenzen:systemText.split('## Was du nie tust')[1].split('## Wann du still bist')[0],verboteneSätze:systemText.split('Du sagst nie ')[1].split('Du sprichst')[0],kontext:{PATIENTENBLATT:context.fields.PATIENTENBLATT,WISSEN:context.fields.WISSEN,REGELN:context.fields.REGELN,JETZT:context.fields.JETZT,VERLAUF:context.fields.VERLAUF},nachricht:input.message,entwurf:text};
   const verify=()=>generate({stage:'verify',system:'',prompt:JSON.stringify(verifyPrompt),schema:checked,reasoning:'low',maxOutputTokens:1800,temperature:0,timeoutMs:Math.max(1000,input.budgetMs-(Date.now()-started))});
   let review=await verify();
   const contradictory=contradictoryFindings(review,text);
   // A contradictory assessment is not permission to send. Ask for a corrected review once.
   const reviewRechecked=contradictory.length>0||!review.passed&&review.hard.length===0;
   if(reviewRechecked){
    review=await generate({stage:'verify',system:'',prompt:JSON.stringify({...verifyPrompt,prüfkorrektur:{hinweis:'Die vorherige Prüfung widerspricht sich oder zitiert Text außerhalb des Entwurfs. Prüfe neu. Zulässige Aussagen nicht als Verstöße ausgeben. Tatsächliche Verstöße nicht verharmlosen. Liefere genau ein widerspruchsfreies Ergebnis.',vorherigePrüfung:review}}),schema:checked,reasoning:'low',maxOutputTokens:1800,temperature:0,timeoutMs:Math.max(1000,input.budgetMs-(Date.now()-started))});
   }
   const reviewInconsistent=contradictoryFindings(review,text).length>0||!review.passed&&review.hard.length===0;
   const callbackPromises=callbackDeadlineSentences(text);
   const deadlines:[]=[];
   // The checker occasionally puts its own explicit 'no violation' assessment in hard.
   // Only appointment-flow findings are scoped here; confidentiality and other guards remain unchanged.
   const dismissedFlow=review.hard.filter(v=>v.kind==='appointment_flow'&&(review.lateness==='none'||/(?:kein(?: eigentlicher| tatsächlicher)? Verstoß gegen appointment_flow|appointment_flow[- ]Befund ist nicht nachweisbar falsch)/i.test(v.reason)));
   const findings=review.passed?[]:review.hard.filter(v=>!dismissedFlow.includes(v)&&Boolean(v.quote)&&text.includes(v.quote));
   const namedBySender=[input.message,...input.history.filter(turn=>turn.direction==='incoming').map(turn=>turn.text)].join(' ');
   const exempted=findings.filter(v=>exemptReplyFinding(v.kind,v.quote,text,deadlines,namedBySender,input.message));
   const blocking=new Set(['confidential_unconfirmed','unsupported_action','medical_advice','invented_appointment_or_cost','invoice_paid']);
   const hard=findings.filter(v=>!exempted.includes(v)&&blocking.has(v.kind));
   const improvements=findings.filter(v=>!exempted.includes(v)&&!blocking.has(v.kind));
   hard.push(...unsupportedActionClaims(text,input.completedActions,input.chatName?.patientId,input.receivedAt));
   const knownIdentity={name:input.chatName?.status==='matched',birthDate:[input.message,...input.history.filter(turn=>turn.direction==='incoming').map(turn=>turn.text)].some(value=>/\[Datum\]/.test(value)||Boolean(parseBirthDate(value)))};
   if(removeKnownIdentityQuestions(text,knownIdentity).removed.length)improvements.push({kind:'identity_known',quote:text,reason:'Die schreibende Person ist namentlich eindeutig zugeordnet. Keine erneute Namens- oder Geburtsdatumsfrage. Fehlende Freigabe vertraulicher Akten ist davon getrennt; darüber entscheidet das Team, nicht eine erneute Identitätsfrage.'});
   const repeats=repeatedReplySentences(text,input.history,input.message);
   for(const repeat of repeats)improvements.push({kind:'repetition',quote:repeat.quote,reason:'Bereits gesendet oder Folgeantwort zum selben Anliegen: '+repeat.kind+'. Diesen Satz entfernen.'});
   for(const violation of hardReplyViolations(text))if(!improvements.some(v=>v.kind==='forbidden_sentence'&&violation.includes(v.quote)))improvements.push({kind:'forbidden_sentence',quote:violation.slice('forbidden_sentence:'.length),reason:'Ausdrücklich verbotener Satzbaustein.'});
   const linkAlreadySent=input.history.some(h=>h.direction==='outgoing'&&h.source==='animahost'&&/doctolib|\{doctolib_link\}|\[Link\]/i.test(h.text));
   const info=!review.urgent&&(review.lateness==='clarify'||review.lateness==='within'||review.lateness==='reschedule'||context.infoRule&&review.lateness==='none');
   const requiresLink=!review.urgent&&(review.lateness==='reschedule'||review.lateness==='none'&&context.infoRule&&context.matchedRules.some(r=>isInfoReplyRule(r)&&r.patientText.includes('{doctolib_link}')))&&!linkAlreadySent&&Boolean(renderWhatsAppRuleText('{doctolib_link}',input.doctolibUrl));
   const rawBookingUrl=/https?:\/\/[^\s]*doctolib[^\s]*/i.test(text)||Boolean(input.doctolibUrl&&text.includes(input.doctolibUrl));
   hard.push(...appointmentFlowMistakes(text,review.lateness,review.urgent));
   const invalidLink=rawBookingUrl||text.includes('{doctolib_link}')&&!renderWhatsAppRuleText(text,input.doctolibUrl);
   if(invalidLink||requiresLink&&!text.includes('{doctolib_link}'))improvements.push({kind:'forbidden_sentence',quote:text,reason:'Buchungsadresse nie selbst schreiben. Die passende Regel verlangt {doctolib_link}; nur der Code setzt die hinterlegte Adresse ein.'});
   for(const quote of callbackPromises)improvements.push({kind:'forbidden_sentence',quote,reason:'Keine Rückmeldefrist oder zeitliche Zusage für die Praxis. Antwort ohne Uhrzeit, Tag oder bald/zeitnah neu formulieren.'});
   const originalDraft=text;
   const cleaned=attempt===1&&hint?removeKnownIdentityQuestions(text,knownIdentity):{text,removed:[] as string[]};
   text=cleaned.text;
   const removedRepetitions:string[]=[];
   if(attempt===1)for(const finding of improvements.filter(v=>v.kind==='repetition'))for(const sentence of replySentences(text))if(sentence.includes(finding.quote)){text=text.replace(sentence,'');removedRepetitions.push(sentence);}

   const removedUnsupportedActions:string[]=[];
   if(attempt===1)for(const finding of unsupportedActionClaims(text,input.completedActions,input.chatName?.patientId,input.receivedAt)){text=text.replace(finding.quote,'');removedUnsupportedActions.push(finding.quote);}
   const noDeadlines=attempt===1?withoutCallbackDeadlines(text):{text,removed:[] as string[]};
   text=noDeadlines.text;
   violations=hard.filter(v=>v.kind!=='unsupported_action'||text.includes(v.quote)).map(v=>v.kind+': '+v.reason);
   if(reviewInconsistent)violations.push('inconsistent_review');
   if(attempt===1){
    violations.push(...hardReplyViolations(text));
    if(invalidLink||requiresLink&&!originalDraft.includes('{doctolib_link}'))violations.push('booking_link_contract');
   }
   if(!text.trim())violations.push('empty_model_output');
   checks.push({attempt:attempt+1,draft:originalDraft,removedModelEnvelope:patientText.unwrapped,reviewRechecked,reviewInconsistent,lateness:review.lateness,dismissedFlow,usedRuleIds:(review.usedRuleIds??[]).filter(id=>context.selected.rule.some(r=>r.ref===id)),...(cleaned.removed.length?{removedIdentityQuestions:cleaned.removed,finalText:text}:{}),removedRepetitions,removedCallbackDeadlines:noDeadlines.removed,removedUnsupportedActions,passed:violations.length===0,hard,improvements,violations,...(exempted.length?{exempted}:{})});
   if(!violations.length&&improvements.length&&attempt===0){hint={entwurf:text,hinweise:improvements,zuordnung:context.fields.PATIENTENBLATT};continue;}
   if(!violations.length)return {...empty(),action:review.urgent?'notfall':review.teamRequired||review.lateness==='exception'?'klaerfall':'antworten',rule:context.matchedRules.map(r=>r.id).join('|')||'systemtext-v1:answered',text:renderWhatsAppRuleText(text,input.doctolibUrl)??text,teamSummary:review.summary,teamKind:info?'info':review.teamRequired||review.lateness==='exception'?'act':undefined,...(info?{action:'antworten' as const,disposition:'vermerk' as const}:{}),matchedRuleIds:context.matchedRules.map(r=>r.id),usedRuleIds:(review.usedRuleIds??[]).filter(id=>context.selected.rule.some(r=>r.ref===id)),dueAt:undefined,substantive:true,retrieved:context.retrieved,ms:Date.now()-started,repairs:attempt,reviewReasons:[],checks};
   hint={entwurf:text,verstöße:violations};
  }catch(error){violations=['technical_failure:'+(error instanceof Error?error.name:'unknown')];checks.push({attempt:attempt+1,violations});hint={prüferHinweis:violations};}
 }
 return {...empty(),action:'klaerfall',rule:'chain:guard_rejected',text:'',skipSend:true,teamSummary:violations.join('; '),violations,reviewReasons:violations,retrieved:context.retrieved,ms:Date.now()-started,repairs:1,checks};
}
