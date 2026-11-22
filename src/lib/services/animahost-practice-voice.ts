import {z} from 'zod';
import type {Generate} from './animahost-chain';
import type {WhatsAppRule} from './animahost-whatsapp';

/**
 * Lernen aus den früheren Antworten der Praxis (Juan, 22.11.2026).
 * 3 Schritte, jeder liest nur und schreibt nichts:
 *  - zuordnen: Zu welcher Regel gehört ein Paar aus Patientenfrage und Praxisantwort, oder gibt es dafür noch keine Regel?
 *  - buendeln: Viele frei benannte Themen ohne Regel zu wenigen gleichnamigen Themen zusammenführen.
 *  - beschreiben: Wie antwortet die Praxis bei 1 Thema typischerweise, und worin weicht das von der heutigen Regel ab?
 * Die Texte kommen bereits ohne Namen an. Was hier herauskommt, ist ein Vorschlag für Menschen und geht nie von selbst an Patienten.
 */
export const voicePairSchema=z.strictObject({id:z.string().min(1).max(40),frage:z.string().max(700),antwort:z.string().min(1).max(900)});
export type VoicePair=z.infer<typeof voicePairSchema>;
export const NO_RULE='keine';

const assigned=z.object({zuordnung:z.array(z.object({id:z.string(),regel:z.string(),thema:z.string()}))});
const bundled=z.object({themen:z.array(z.object({name:z.string(),gehoertDazu:z.array(z.number())}))});
const described=z.object({muster:z.string(),typischeAntwort:z.string(),unterschied:z.string().nullable(),brauchtMenschen:z.boolean()});

const ASSIGN=`Du ordnest frühere WhatsApp-Wechsel einer kieferorthopädischen Praxis ein.
Jeder Eintrag hat eine Frage eines Patienten oder Elternteils und die Antwort, die die Praxis damals selbst geschrieben hat.
Du bekommst außerdem die Regeln, nach denen der Assistent der Praxis heute antwortet.
Für jeden Eintrag:
- "regel": die id der Regel, die das Anliegen der Frage abdeckt. Passt keine wirklich, schreibe genau "${NO_RULE}". Rate nicht.
- "thema": das Anliegen in 2 bis 5 Wörtern, so wie eine Praxismitarbeiterin es nennen würde (zum Beispiel "Termin absagen", "Rechnung nicht gefunden"). Keine Namen, keine Daten.
Gib jede id genau 1-mal zurück. Erfinde keine Einträge.`;

const BUNDLE=`Du bekommst nummerierte Themen aus WhatsApp-Wechseln einer kieferorthopädischen Praxis, jeweils mit ihrer Häufigkeit. Viele meinen dasselbe und heißen nur anders.
Führe sie zu höchstens 25 klar unterscheidbaren Themen zusammen. Jedes Thema bekommt einen kurzen deutschen Namen (2 bis 5 Wörter).
"gehoertDazu" nennt nur die Nummern der ursprünglichen Themen. Jede Nummer kommt in genau 1 Thema vor. Seltenes, das nirgends passt, kommt in "Sonstiges".`;

const DESCRIBE=`Du beschreibst, wie eine kieferorthopädische Praxis ein bestimmtes Anliegen in WhatsApp selbst beantwortet hat.
Du bekommst echte Antworten der Praxis (ohne Namen), einige Fragen dazu und, falls vorhanden, den Text, den der Assistent der Praxis heute bei diesem Anliegen schreibt.
- "muster": 2 bis 4 Sätze. Was tut die Praxis in ihren Antworten inhaltlich, und was ist ihr dabei wichtig? Nur was die Antworten wirklich zeigen.
- "typischeAntwort": 1 Antwort im Ton und in der Länge der Praxis, wie sie diese am häufigsten gibt. Ohne Namen. Wo die Praxis ein Datum, eine Uhrzeit oder einen Betrag nennt, schreibe stattdessen einen Platzhalter in eckigen Klammern wie [Datum] oder [Uhrzeit].
- "unterschied": 1 bis 2 Sätze, worin die Praxis anders antwortet als der heutige Text des Assistenten. null, wenn es keinen heutigen Text gibt oder beide im Kern dasselbe sagen.
- "brauchtMenschen": true, wenn die Praxis in ihren Antworten meistens etwas entscheidet oder nachsieht, das nur ein Mensch mit Blick in den Kalender oder die Akte kann.
Erfinde nichts. Wenn die Antworten sich stark unterscheiden, sag das im "muster".`;

const clean=(value:string,max:number)=>value.replace(/\s+/g,' ').trim().slice(0,max);

/** Je Paar die Regel (oder keine) und ein kurzes Thema. Unbekannte Regel-ids und fehlende Paare werden zu „keine“ und „unklar“, nie geraten. */
export async function assignPairs(generate:Generate,pairs:VoicePair[],rules:WhatsAppRule[],timeoutMs:number){
 const known=new Set(rules.map(rule=>rule.id));
 const result=await generate({system:ASSIGN,schema:assigned,maxOutputTokens:9000,timeoutMs,temperature:0,
  prompt:JSON.stringify({regeln:rules.map(rule=>({id:rule.id,thema:rule.topic,stichworte:rule.keywords.slice(0,8)})),eintraege:pairs})});
 const byId=new Map(result.zuordnung.map(item=>[item.id,item]));
 return pairs.map(pair=>{
  const hit=byId.get(pair.id);
  return {id:pair.id,rule:hit&&known.has(hit.regel)?hit.regel:NO_RULE,topic:hit?clean(hit.thema,60)||'unklar':'unklar',assigned:Boolean(hit)};
 });
}

/** Frei benannte Themen zusammenführen. Jedes Thema, das das Modell nicht einsortiert hat, bleibt unter seinem eigenen Namen bestehen. */
export async function bundleTopics(generate:Generate,topics:{name:string;count:number}[],timeoutMs:number){
 const result=await generate({system:BUNDLE,schema:bundled,maxOutputTokens:9000,timeoutMs,temperature:0,
  prompt:JSON.stringify({themen:topics.map((topic,i)=>({nr:i+1,name:topic.name,anzahl:topic.count}))})});
 const map:Record<string,string>={};
 for(const group of result.themen){
  const name=clean(group.name,60);
  if(!name)continue;
  for(const nr of group.gehoertDazu){const member=topics[nr-1]?.name;if(member&&!(member in map))map[member]=name;}
 }
 for(const topic of topics)if(!(topic.name in map))map[topic.name]=topic.name;
 return map;
}

export async function describeTopic(generate:Generate,input:{topic:string;answers:string[];questions:string[];rule:WhatsAppRule|null},timeoutMs:number){
 const result=await generate({system:DESCRIBE,schema:described,maxOutputTokens:7000,timeoutMs,temperature:0.2,
  prompt:JSON.stringify({anliegen:input.topic,heutigerTextDesAssistenten:input.rule?input.rule.patientText:null,
   heutigerWeg:input.rule?(input.rule.action==='antworten'?'Assistent antwortet selbst':'Assistent gibt ans Team weiter'):null,
   fragen:input.questions,antwortenDerPraxis:input.answers})});
 return {pattern:clean(result.muster,900),typical:result.typischeAntwort.trim().slice(0,1200),difference:result.unterschied?clean(result.unterschied,500):null,needsHuman:result.brauchtMenschen};
}
