import test from 'node:test';
import assert from 'node:assert/strict';
import type {Generate} from '../animahost-chain';
import type {WhatsAppRule} from '../animahost-whatsapp';
import {NO_RULE,assignPairs,bundleTopics,describeTopic} from '../animahost-practice-voice';

const rules:WhatsAppRule[]=[
 {id:'termin-absagen',topic:'Termin absagen',keywords:['absagen'],action:'klaerfall',patientText:'Danke für die Nachricht. Das Team meldet sich.'},
 {id:'oeffnungszeiten',topic:'Öffnungszeiten',keywords:['geöffnet'],action:'antworten',patientText:'Wir sind Dienstag bis Donnerstag für Sie da.'},
];
const model=(answer:unknown,seen:{prompt:string}[]=[]):Generate=>async call=>{seen.push({prompt:call.prompt});return answer as never;};

test('Zuordnung: unbekannte Regel wird „keine“, ein vom Modell vergessenes Paar bleibt sichtbar als nicht zugeordnet',async()=>{
 const pairs=[{id:'a',frage:'Wir schaffen es morgen nicht.',antwort:'Danke, ich trage es aus.'},{id:'b',frage:'Wann haben Sie auf?',antwort:'Dienstag bis Donnerstag.'},
  {id:'c',frage:'Die Spange drückt.',antwort:'Bitte kommen Sie vorbei.'}];
 const result=await assignPairs(model({zuordnung:[{id:'a',regel:'termin-absagen',thema:'Termin absagen'},{id:'b',regel:'erfundene-regel',thema:'Öffnungszeiten'},
  {id:'zzz',regel:'oeffnungszeiten',thema:'Erfunden'}]}),pairs,rules,1000);
 assert.deepEqual(result,[{id:'a',rule:'termin-absagen',topic:'Termin absagen',assigned:true},{id:'b',rule:NO_RULE,topic:'Öffnungszeiten',assigned:true},
  {id:'c',rule:NO_RULE,topic:'unklar',assigned:false}]);
});
test('Zuordnung schickt dem Modell von den Regeln nur Thema und Stichworte, nicht die Patiententexte',async()=>{
 const seen:{prompt:string}[]=[];
 await assignPairs(model({zuordnung:[]},seen),[{id:'a',frage:'Hallo',antwort:'Hallo'}],rules,1000);
 assert.match(seen[0].prompt,/termin-absagen/);
 assert.doesNotMatch(seen[0].prompt,/Das Team meldet sich/);
});
test('Bündeln: jedes Thema landet in genau 1 Gruppe, Vergessenes behält seinen Namen, Erfundenes wird ignoriert',async()=>{
 const topics=[{name:'Termin absagen',count:9},{name:'Terminabsage',count:4},{name:'Spange drückt',count:3},{name:'Parkplatz',count:1}];
 const map=await bundleTopics(model({themen:[{name:'Termin absagen',gehoertDazu:['Termin absagen','Terminabsage','Gibt es nicht']},
  {name:'Beschwerden mit der Spange',gehoertDazu:['Spange drückt','Terminabsage']}]}),topics,1000);
 assert.deepEqual(map,{'Termin absagen':'Termin absagen','Terminabsage':'Termin absagen','Spange drückt':'Beschwerden mit der Spange','Parkplatz':'Parkplatz'});
});
test('Beschreiben: gibt Muster, typische Antwort und Unterschied zurück und legt dem Modell den heutigen Text der Regel vor',async()=>{
 const seen:{prompt:string}[]=[];
 const result=await describeTopic(model({muster:'  Die Praxis bestätigt   kurz. ',typischeAntwort:'Vielen Dank, ich habe den Termin ausgetragen.',unterschied:null,brauchtMenschen:true},seen),
  {topic:'Termin absagen',answers:['Danke, ich trage es aus.','Alles klar, ist ausgetragen.','Danke für die Info.'],questions:['Wir schaffen es nicht.'],rule:rules[0]},1000);
 assert.deepEqual(result,{pattern:'Die Praxis bestätigt kurz.',typical:'Vielen Dank, ich habe den Termin ausgetragen.',difference:null,needsHuman:true});
 assert.match(seen[0].prompt,/Das Team meldet sich/);
 assert.match(seen[0].prompt,/Assistent gibt ans Team weiter/);
});
