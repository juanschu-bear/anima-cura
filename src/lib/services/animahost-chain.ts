import {PRACTICE_STYLE} from './animahost-practice-style';
import {z} from 'zod';
import {emergencyDecision,explicitOptOut,mandatoryAppointmentClarification,renderWhatsAppRuleText,safeRuleText,type WhatsAppRule} from './animahost-whatsapp';
import type {ConversationHistory} from './animahost-whatsapp-conversation';
import {dossierForModel,type Dossier} from './animahost-dossier';
import type {ApprovedKnowledge} from './animahost-knowledge';

/**
 * Die Antwortkette von AnimaHost (Juan, 22.11.2026): erst wissen, wer schreibt, dann verstehen, dann frei antworten, dann gegenprüfen.
 *  1. Akte und Verlauf liegen vor (animahost-dossier.ts).
 *  2. Verstehen und schreiben: 1 Durchgang ordnet jedes Anliegen einem Weg zu und formuliert 1 Antwort. Die Regeln der Praxis sind
 *     dabei Wissen und kein Textbaustein.
 *  3. Feste Schranken im Code: Links, Uhrzeiten, Daten, Beträge, Telefonnummern und Namen müssen aus den Quellen stammen.
 *  4. Gegenprüfen: Ein 2. Durchgang prüft die Antwort unabhängig gegen die Quellen. Bei Verstößen gibt es 1 Korrekturversuch.
 * Besteht die Antwort nicht, gilt `ok:false` und der Aufrufer bleibt bei seiner bisherigen, freigegebenen Antwort.
 * Notfälle und der Wunsch, keine Nachrichten mehr zu bekommen, laufen nie durch die Kette.
 * Hier wird nichts gespeichert und nichts verschickt.
 */
export type Generate=<T>(call:{plainText?:boolean;stage?:'compose'|'verify';reasoning?:'none'|'low';system:string;prompt:string;schema:z.ZodType<T>;maxOutputTokens:number;timeoutMs:number;temperature:number})=>Promise<T>;
export type ChainInput={
 message:string;language:'de'|'en'|'es';informal:boolean;history:ConversationHistory;dossier:Dossier;rules:WhatsAppRule[];
 practice:{doctolibUrl:string|null;phone:string|null;teamTime:string;today:string;closurePeriods?:unknown;timeZone?:string};
 approvedKnowledge?:ApprovedKnowledge[];
 knowledgeMode?:'approved'|'draft_preview';
 /** Bisherige, freigegebene Antwort. Für das Anliegen, das sie beantwortet, ist ihr Inhalt verbindlich. */
 baseline:{action:'antworten'|'klaerfall';rule:string;text:string}|null;
 budgetMs:number;
};
export type ChainConcern={quote:string;topic:string;way:'regel'|'akte'|'identitaet'|'team'|'gespraech'};
export type ChainResult=
 |{ok:true;action:'antworten'|'klaerfall';rule:string;text:string;concerns:ChainConcern[];teamSummary:string|null;asksIdentity:boolean;usedRuleIds:string[];usedKnowledge:UsedKnowledge[];attempts:number;ms:number}
 |{ok:false;reason:'reserved'|'no_time'|'model_failed'|'rejected';violations:string[];ms:number};

const WAYS=['regel','akte','identitaet','team','gespraech'] as const;
const usedKnowledge=z.strictObject({id:z.string().uuid(),version:z.number().int().positive(),claim:z.string().trim().min(1).max(400)});
export type UsedKnowledge=z.infer<typeof usedKnowledge>;
const references=z.array(usedKnowledge).max(10);
const composed=z.object({
 anliegen:z.array(z.object({zitat:z.string().max(400),thema:z.string().max(120),weg:z.enum(WAYS),regelIds:z.array(z.string().max(120)).max(4)})).max(6),
 antwort:z.string().min(1).max(1600),
 team:z.boolean(),
 teamZusammenfassung:z.string().max(900).nullable(),
 fragtIdentitaet:z.boolean(),
 wissensbelege:references.optional(),
});
const VIOLATIONS=['erfundene_tatsache','terminzusage','medizinischer_rat','vertrauliches_ohne_bestaetigung','falsche_person','anliegen_uebergangen',
 'team_ohne_zeit','unnoetige_uebergabe','falsche_sprache_oder_anrede','widerspruch_zur_vorgabe','wiederholt_fruehere_antwort'] as const;
const checked=z.object({verstoesse:z.array(z.enum(VIOLATIONS)).max(8),hinweis:z.string().max(400),wissensbelege:references.optional()});

const SYSTEM=`Du bist AnimaHost und antwortest am WhatsApp einer kieferorthopädischen Praxis. Du bist für die Patienten da, damit das Praxisteam nicht jede Nachricht selbst beantworten muss.

So gehst du vor:
1. Lies zuerst "akte" und "verlauf". Du weißt dann, wer vermutlich schreibt und was schon besprochen wurde.
2. Verstehe JEDES Anliegen der neuesten Nachricht, auch wenn es mehrere sind. Jedes bekommt einen Weg:
   - regel: Eine Praxisregel beantwortet es. Trage ihre id in regelIds ein.
   - akte: Eine Angabe aus der Akte beantwortet es.
   - identitaet: Es geht um Vertrauliches (Rechnungsdetails, Zahlungen, Mahnung, Besuche) und für die betroffene Person steht kein Block "vertraulich" in der Akte. Dann bittest du um Vor- und Nachnamen und Geburtsdatum des Patienten.
   - team: Weder Regeln noch Akte reichen. Das Team klärt es.
   - gespraech: Dank, Gruß, Bestätigung oder Ärger ohne Frage. Eine kurze menschliche Reaktion genügt.
3. Schreibe 1 Antwort, wie ein aufmerksamer Mensch am Empfang dieser Praxis sie schreiben würde. Beantworte alle Anliegen in der Reihenfolge des Patienten. Erkenne wiederkehrende Schwierigkeiten an. Bei einem Apparaturproblem frage höchstens einmal nach Drücken oder Schmerzen, wenn das der Praxis hilft. Ein abgebrochenes loses Teil aufheben und mitbringen und spontane Besuche mit Wartezeit darfst du vorschlagen, wenn die freigegebene Quelle es abdeckt. Stelle die tatsächlich erlaubten Optionen zur Wahl. Auf einen Einwand geh ein, wiederhole die Regel nicht und gib den strittigen Teil ans Team.
   "schreibweise" sagt dir, wie diese Praxis schreibt. Halte dich daran: Länge, Beginn, Ende und Ton. Ohne Aufzählungszeichen.

Feste Grenzen:
- Tatsachen stammen nur aus den Regeln, der Akte, dem Verlauf und der Nachricht. Erfinde nichts: keine Uhrzeiten, Daten, Preise, Abläufe oder Zusagen. Steht etwas nicht in den Quellen, sag ehrlich, dass das Team es klärt.
- Du siehst keinen Kalender. Du vergibst, verschiebst und bestätigst keine Termine. Zu Terminen gilt, was die Regeln sagen. Einen Link nennst du nur wörtlich so, wie er in einer Regel oder in der Vorgabe steht.
- Keine Diagnosen, keine Behandlungsempfehlungen und keine Dosierungen, auch wenn eine Quelle sie erwähnt. Zulässig sind belegte organisatorische Hinweise und die Bitte um Beschreibung akuter Zeichen. Keine Anbieternamen oder Begriffe für die eingesetzte Technik im Antworttext. Der freigegebene Buchungsdienst ist ausgenommen.
- Angaben unter "vertraulich" nennst du nur für die Person, bei der sie stehen. Nenne niemals Geldbeträge. Die Patientennummer erwähnst du nicht.
- Nenne einen Patienten nur beim Namen, wenn die Nachricht oder der Verlauf diesen Namen nennt. Geht es um jemanden, der nicht in der Akte steht, nimm niemanden aus der Akte an.
- Übergib nichts ans Team, was du selbst beantworten kannst. Der Wunsch nach einer bestimmten Person ist allein kein Grund für eine Übergabe: Biete an, sofort zu helfen, und frag nach dem Anliegen.
- Geht mindestens 1 Anliegen ans Team: team=true. Die Antwort sagt klar, was du weitergibst, und nennt wörtlich die Rückmeldezeit aus "rueckmeldezeitTeam". teamZusammenfassung fasst für die Praxis sachlich alles zusammen, mit allen Namen, Daten und Uhrzeiten aus der Nachricht. Sonst team=false und teamZusammenfassung=null.
- Ist "vorgabe" gesetzt, ist ihr Inhalt für das Anliegen verbindlich, das sie beantwortet: Aussage, Links und Zusagen bleiben. Die Formulierung darfst du anpassen und um die übrigen Anliegen ergänzen.
- Sprache: die des Patienten. Anrede: wie in "anrede" vorgegeben. Grüße höchstens 1-mal, und gar nicht, wenn im Verlauf heute schon gegrüßt wurde. Wiederhole keine Antwort, die schon im Verlauf steht, sondern geh auf den Einwand ein.
- "zitat" ist ein wörtlicher Ausschnitt der neuesten Nachricht.
- Belege jeden verwendeten Eintrag aus "wissen" in wissensbelege mit id, version und der konkreten Aussage im Antworttext. Lege keine Belege für bloß gelesene Einträge an. Nicht freigegebene Informationen bleiben offen.`;

const VERIFY=`Du prüfst unabhängig eine vorgeschlagene WhatsApp-Antwort einer Praxis gegen die Quellen. Melde nur konkrete Verstöße, sonst verstoesse=[].
- erfundene_tatsache: eine Uhrzeit, ein Datum, ein Preis, ein Ablauf oder eine Aussage, die weder in den Regeln noch in der Akte, dem Verlauf, der Nachricht oder der Vorgabe steht.
- terminzusage: Die Antwort vergibt, verschiebt oder bestätigt einen Termin oder tut so, als sei der Kalender geändert.
- medizinischer_rat: Diagnose, Behandlungsrat oder Dosierung, auch wenn eine Quelle ihn erwähnt. Ein freigegebener rein organisatorischer Hinweis ist zulässig.
- vertrauliches_ohne_bestaetigung: Rechnungsdetails, Zahlungen, Mahnung oder Besuche einer Person, für die in der Akte kein Block "vertraulich" steht. Auch jeder Geldbetrag.
- falsche_person: Die Antwort bezieht sich auf einen Patienten der Akte, obwohl die Nachricht von jemand anderem handelt, oder nennt einen Namen, den weder Nachricht noch Verlauf nennen.
- anliegen_uebergangen: Ein eigenständiges Anliegen der neuesten Nachricht bleibt ohne Antwort und ohne Übergabe.
- team_ohne_zeit: Die Antwort gibt etwas ans Team, nennt aber die Rückmeldezeit nicht wörtlich.
- unnoetige_uebergabe: Die Antwort gibt etwas ans Team, das eine Regel oder die Akte eindeutig beantwortet.
- falsche_sprache_oder_anrede: andere Sprache als der Patient oder falsche Anrede (Du statt Sie oder umgekehrt).
- widerspruch_zur_vorgabe: Die Antwort widerspricht der Vorgabe oder lässt deren Link oder Zusage weg.
- wiederholt_fruehere_antwort: Die Antwort ist inhaltlich dieselbe wie eine Antwort, die schon im Verlauf steht, obwohl der Patient darauf eingegangen ist.
Gib in wissensbelege unabhängig die geprüften id/version und den wörtlichen Satz aus der vorgeschlagenen Antwort wieder, für jeden aus "wissen" übernommenen Fakt. Nutze keine erfundenen Belege. Eine freundlichere oder kürzere Formulierung ist kein Verstoß. Prüfe den Inhalt und nicht den Wortlaut. Im Zweifel für die Antwort entscheidest du nur, wenn du keinen der Punkte konkret belegen kannst.`;

const urls=(text:string)=>text.match(/https?:\/\/[^\s<>"')]+/g)?.map(url=>url.replace(/[.,;:!?]+$/,''))??[];
const digits=(text:string)=>text.replace(/\D/g,'');
/** Stunden aus Uhrzeiten („15 Uhr“, „9:30“, „halb 4“ zählt nicht), Tage und Monate aus Daten („30.11.“). */
const MONTHS=['januar','februar','märz','april','mai','juni','juli','august','september','oktober','november','dezember',
 'january','february','march','april','may','june','july','august','september','october','november','december'];
function numbersIn(text:string){
 const hours=new Set<number>(),times=new Set<string>(),dates=new Set<string>(),phones=new Set<string>(),money=new Set<string>();
 const all=(pattern:RegExp)=>Array.from(text.matchAll(pattern));
 all(/\b(\d{1,2})[:.](\d{2})\s*(?:Uhr|h\b|am\b|pm\b)?/gi).forEach(hit=>{
  // „30.11“ ist ein Datum und keine Uhrzeit: Uhrzeiten haben einen Doppelpunkt oder das Wort „Uhr“, Stunden bis 24 und Minuten bis 59.
  const first=Number(hit[1]),second=Number(hit[2]);
  if((hit[0].includes(':')||/uhr|h\b|am\b|pm\b/i.test(hit[0]))&&first<=24&&second<=59){hours.add(first);times.add(`${first}:${second}`);}
 });
 all(/\b(\d{1,2})\s*(?:Uhr|o.clock|h\b)/gi).forEach(hit=>hours.add(Number(hit[1])));
 all(/\b(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(\d{2,4}))?/g).forEach(hit=>dates.add(`${Number(hit[1])}.${Number(hit[2])}`));
 // „14. Oktober“, „14.10.“ und „2026-10-14“ sind dasselbe Datum. Sonst gälte ein nur anders geschriebenes Datum als erfunden.
 all(new RegExp(`\\b(\\d{1,2})\\.?\\s*(${MONTHS.join('|')})(?![A-Za-zÄÖÜäöüß])`,'gi')).forEach(hit=>dates.add(`${Number(hit[1])}.${MONTHS.indexOf(hit[2].toLowerCase())%12+1}`));
 all(/\b\d{4}-(\d{2})-(\d{2})\b/g).forEach(hit=>dates.add(`${Number(hit[2])}.${Number(hit[1])}`));
 all(/(?:\+|\b0)[\d\s/()-]{7,}\d/g).forEach(hit=>{const value=digits(hit[0]).replace(/^0+/,'');if(value.length>=7)phones.add(value.slice(-9));});
 all(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euro|eur\b)|(?:€|eur\b)\s*(\d+(?:[.,]\d{1,2})?)/gi).forEach(hit=>money.add((hit[1]??hit[2]).replace(',','.')));
 return {hours,times,dates,phones,money};
}
const mentions=(text:string,name:string)=>{
 const parts=name.toLocaleLowerCase('de-DE').split(/[\s-]+/).filter(part=>part.length>1);
 const words=new Set(text.toLocaleLowerCase('de-DE').replace(/[^a-zß-ÿ0-9]+/g,' ').split(' '));
 return parts.some(part=>words.has(part)||words.has(`${part}s`));
};

/** Feste Schranken: Was hier durchfällt, darf kein Patient lesen, egal wie gut es klingt. */
export function guardReply(reply:string,input:ChainInput,flags:{team:boolean;asksIdentity:boolean},sources:{ruleTexts:string[];facts:string[];names:string[]}):string[]{
 const violations:string[]=[];
 const text=reply.trim();
 if(!text)return ['leer'];
 if(text.length>1200)violations.push('zu_lang');
 if(/patientennummer|patient number|número de paciente/i.test(text))violations.push('patientennummer');
 if(/\b(?:supabase|vercel|next\.js|chatgpt|claude|anthropic|openai|baileys|llm)\b/i.test(text))violations.push('technologiemarke');
 if(/\b(?:termin|appointment|cita)\b[^.!?]{0,70}\b(?:ist jetzt|ist hiermit|habe ich|hab ich|wurde|ist verbindlich|has been|i have|está|ha sido)\s+(?:für sie\s+)?(?:gebucht|bestätigt|umgebucht|verschoben|storniert|booked|rescheduled|cancelled|confirmada|cancelada|reprogramada)/i.test(text)||
  /\b(?:ich (?:buche|verschiebe|storniere|bestätige) (?:ihnen |jetzt )?(?:ihren?|den) termin|i.ve (?:booked|rescheduled|cancelled)|(?:ya |le )?(?:confirmé|he reservado))\b/i.test(text))violations.push('terminzusage');
 if(/\b\d+(?:[,.]\d+)?\s*(?:mg|µg|milligramm|tabletten?)\b|\b(?:nehmen sie|nimm|take|tome)\b[^.!?]{0,45}\b(?:ibuprofen|paracetamol|schmerzmittel|painkillers?|antibiotik\w*)\b|\b(?:sie haben|you have|usted tiene)\b[^.!?]{0,30}\b(?:infektion|entzündung|abszess|infection|abscess|infección)\b/i.test(text))violations.push('medizinischer_rat');
 if(input.language==='de'&&!input.informal&&/\b(?:du|dir|dich|dein(?:e[snmr]?)?)\b/i.test(text))violations.push('falsche_anrede');
 const patientSide=[input.message,...input.history.map(item=>item.text)].join('\n');
 const everything=[patientSide,...sources.ruleTexts,input.baseline?.text??'',...sources.facts,input.practice.teamTime,input.practice.today,input.practice.phone??'',input.practice.doctolibUrl??''].join('\n');
 const allowedLinks=new Set(urls([...sources.ruleTexts,input.baseline?.text??'',input.practice.doctolibUrl??''].join('\n')));
 if(urls(text).some(url=>!allowedLinks.has(url)))violations.push('fremder_link');
 if(input.practice.doctolibUrl&&urls(text).includes(input.practice.doctolibUrl)&&
  (mandatoryAppointmentClarification(input.message)||/\b(?:komme|kommen|ankunft|arrive|llegar)\b[^.!?]{0,50}(?:später|statt um|later|tarde)/i.test(input.message)))violations.push('buchungslink_unzulaessig');
 const said=numbersIn(text),known=numbersIn(everything);
 if(Array.from(said.hours).some(hour=>!known.hours.has(hour))||Array.from(said.times).some(time=>!known.times.has(time)))violations.push('uhrzeit_nicht_in_quellen');
 if(Array.from(said.dates).some(value=>!known.dates.has(value)))violations.push('datum_nicht_in_quellen');
 if(Array.from(said.phones).some(value=>!known.phones.has(value)))violations.push('telefonnummer_nicht_in_quellen');
 // Beträge nennt AnimaHost nur, wenn eine Regel oder die Vorgabe genau diesen Betrag enthält.
 const approvedMoney=numbersIn([...sources.ruleTexts,input.baseline?.text??''].join('\n')).money;
 if(Array.from(said.money).some(value=>!approvedMoney.has(value)))violations.push('betrag');
 if(flags.team&&!text.includes(input.practice.teamTime))violations.push('team_ohne_zeit');
 if(!flags.team&&/(?:praxisteam|unser team|das team|the team|el equipo)[^.!?]{0,70}(?:meldet|melden|kümmer|klär|prüf|schaut|sieht|get back|responder)|(?:gebe|leite|reiche)[^.!?]{0,60}(?:weiter|an das team|ans team)/i.test(text))
  violations.push('uebergabe_nicht_gemeldet');
 if(flags.asksIdentity&&!/geburtsdatum|date of birth|fecha de nacimiento/i.test(text))violations.push('frage_nach_geburtsdatum_fehlt');
 for(let i=0;i<sources.names.length;i+=1){
  const name=sources.names[i];
  if(name&&mentions(text,name)&&!mentions(patientSide,name)&&!mentions(input.baseline?.text??'',name)){violations.push('name_nicht_genannt');break;}
 }
 return violations;
}

function knowledge(rules:WhatsAppRule[],doctolibUrl:string|null){
 return rules.filter(rule=>rule.action!=='notfall'&&safeRuleText(rule)).flatMap(rule=>{
  const text=renderWhatsAppRuleText(rule.patientText,doctolibUrl);
  return text===null?[]:[{id:rule.id,thema:rule.topic,aussage:text,terminart:rule.appointmentDescription,danach:rule.action==='klaerfall'?'geht zusätzlich ans Team':'erledigt'}];
 });
}

function matchingKnowledge(approved:ApprovedKnowledge[],message:string){
 const terms=Array.from(new Set((message.toLocaleLowerCase('de').match(/[a-zäöüßà-ÿ]{4,}/g)??[]).map(term=>term.slice(0,6))));
 return approved.map(entry=>({entry,score:terms.reduce((score,term)=>score+
  (entry.title.toLocaleLowerCase('de').includes(term)?3:entry.content.toLocaleLowerCase('de').includes(term)?1:0),0)}))
  .sort((a,b)=>b.score-a.score).slice(0,24).map(item=>item.entry);
}

export async function runChain(generate:Generate,input:ChainInput):Promise<ChainResult>{
 const started=Date.now(),left=()=>input.budgetMs-(Date.now()-started),ms=()=>Date.now()-started;
 if(emergencyDecision(input.message)||explicitOptOut(input.message))return {ok:false,reason:'reserved',violations:[],ms:ms()};
 const rules=knowledge(input.rules,input.practice.doctolibUrl);
 const approved=matchingKnowledge(input.approvedKnowledge??[],[input.message,...input.history.slice(-4).map(item=>item.text)].join(' '));
 const {akte,facts,names}=dossierForModel(input.dossier);
 const sources={ruleTexts:rules.map(rule=>rule.aussage),facts:[...facts,...approved.flatMap(entry=>[entry.content,...Object.values(entry.guidance??{})])],names};
 const base={neuesteNachricht:input.message,verlauf:input.history.map(item=>({von:item.direction==='incoming'?'Patient':'Praxis',am:item.at,text:item.text})),
  akte,regeln:rules,wissen:approved,wissensstand:input.knowledgeMode??'approved',heute:input.practice.today,rueckmeldezeitTeam:input.practice.teamTime,telefonPraxis:input.practice.phone,
  schliesstage:input.practice.closurePeriods??[],zeitzone:input.practice.timeZone??'Europe/Berlin',buchungslink:input.practice.doctolibUrl,
  anrede:input.informal?'Du':'Sie',sprache:input.language,schreibweise:PRACTICE_STYLE,vorgabe:input.baseline?.text??null};
 let attempts=0,violations:string[]=[],previous:z.infer<typeof composed>|null=null;
 while(attempts<2){
  if(left()<6_000)return {ok:false,reason:attempts?'rejected':'no_time',violations,ms:ms()};
  attempts+=1;
  let draft:z.infer<typeof composed>;
  try{
   draft=await generate({stage:'compose',system:SYSTEM,schema:composed,maxOutputTokens:8000,temperature:0.4,timeoutMs:Math.round(Math.min(Math.max(14_000,input.budgetMs*0.55),Math.max(2_500,left()-3_500))),
    prompt:JSON.stringify(previous?{...base,vorherigerEntwurf:previous.antwort,beanstandet:violations,auftrag:'Schreibe die Antwort neu und behebe genau die beanstandeten Punkte.'}:base)});
  }catch{return {ok:false,reason:'model_failed',violations,ms:ms()};}
  const reply=draft.antwort.trim();
  const flags={team:draft.team,asksIdentity:draft.fragtIdentitaet||draft.anliegen.some(item=>item.weg==='identitaet')};
  violations=guardReply(reply,input,flags,sources);
  const sourceKey=(item:{id:string;version:number})=>`${item.id}:${item.version}`;
  const approvedIds=new Set(approved.map(sourceKey));
  const cited=draft.wissensbelege??[];
  if(cited.some(item=>!approvedIds.has(sourceKey(item))||!reply.includes(item.claim)))violations.push('wissensbeleg_ungueltig');
  if(!violations.length){
   if(left()<2_500)return {ok:false,reason:'no_time',violations,ms:ms()};
   try{
    const verdict=await generate({stage:'verify',system:VERIFY,schema:checked,maxOutputTokens:4000,temperature:0,timeoutMs:Math.round(Math.min(Math.max(9_000,input.budgetMs*0.3),Math.max(2_000,left()-500))),
     prompt:JSON.stringify({...base,vorgeschlageneAntwort:reply,gibtAnsTeam:flags.team})});
    violations=verdict.verstoesse;
    const checkedCites=verdict.wissensbelege??[];
    const citedIds=new Set(cited.map(sourceKey));
    const checkedIds=new Set(checkedCites.map(sourceKey));
    if(citedIds.size!==checkedIds.size||checkedCites.some(item=>!citedIds.has(sourceKey(item))||!reply.includes(item.claim)))
     violations.push('wissensbeleg_nicht_bestaetigt');
   }catch{return {ok:false,reason:'model_failed',violations,ms:ms()};}
  }
  if(!violations.length){
   const known=new Set(rules.map(rule=>rule.id));
   const usedRuleIds=Array.from(new Set(draft.anliegen.flatMap(item=>item.regelIds).filter(id=>known.has(id))));
   const action=flags.team?'klaerfall' as const:'antworten' as const;
   const rule=input.baseline&&input.baseline.action===action?input.baseline.rule:flags.team?(input.baseline?'chain:partial':'chain:team'):flags.asksIdentity?'chain:identity':'chain:answered';
   return {ok:true,action,rule,text:reply,concerns:draft.anliegen.map(item=>({quote:item.zitat,topic:item.thema,way:item.weg})),
    teamSummary:flags.team?(draft.teamZusammenfassung?.trim()||null):null,asksIdentity:flags.asksIdentity,usedRuleIds,usedKnowledge:cited,attempts,ms:ms()};
  }
  previous=draft;
 }
 return {ok:false,reason:'rejected',violations,ms:ms()};
}
