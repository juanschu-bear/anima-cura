import test from 'node:test';
import assert from 'node:assert/strict';
import {matchChatNames,linkedSenderMatch,resolveChatName,senderDeclaration} from '../animahost-name-match';
const patients=[{id:'a',vorname:'Leon Mika',nachname:'Beispiel',versicherter_vorname:'Nora',versicherter_nachname:'Beispiel'},
 {id:'b',vorname:'Mira',nachname:'Beispiel',versicherter_vorname:'Nora',versicherter_nachname:'Beispiel'},
 {id:'c',vorname:'Leon',nachname:'Muster'}];
test('a given name alone never matches even a unique patient',()=>{
 assert.deepEqual(matchChatNames('Hier ist Leon',patients).map(h=>h.patient.id),[]);
 assert.deepEqual(matchChatNames('Mira',patients).map(h=>h.patient.id),[]);
});
test('signature, inverted order and middle names match without proving identity',()=>{
 for(const text of ['Bitte Termin verschieben. Viele Grüße Mika Beispiel','Beispiel Leon','Hier ist Leon Mika Beispiel'])assert.deepEqual(matchChatNames(text,patients).map(h=>h.patient.id),['a']);
});
test('parent names stay sender candidates; a child subject is not the sender',()=>{
 assert.equal(matchChatNames('Hier ist Nora Beispiel',patients).length,2);
 assert.deepEqual(matchChatNames('Mein Sohn Mika braucht einen Termin. Grüße Nora Beispiel',patients).map(h=>h.patient.id),['a','b']);
});
test('ordinary appointment vocabulary is not a name match',()=>{
 assert.deepEqual(matchChatNames('Guten Tag, geht Montag im Mai ein Termin?', [{id:'x',vorname:'Mai',nachname:'Montag'}]),[]);
});
test('third-party consent never turns brother into sender; explicit self-introduction wins',()=>{const family=[{id:'s',vorname:'Mira',nachname:'Beispiel'},{id:'b',vorname:'Amir Leon',nachname:'Beispiel'}];assert.deepEqual(matchChatNames('Ich bestätige, dass mein Bruder Leon Beispiel mit Ihnen kommunizieren darf.',family),[]);assert.deepEqual(matchChatNames('Mein Name ist Mira Beispiel. Mein Bruder Leon Beispiel unterstützt mich.',family).map(h=>h.patient.id),['s']);assert.equal(matchChatNames('Mein Name ist Mira Beispiel.',[...family,{id:'s2',vorname:'Mira',nachname:'Beispiel'}]).length,2);});

test('mother and son mentions do not identify the sender',()=>{for(const relation of ['meine Mutter','mein Sohn','meine Schwester'])assert.deepEqual(matchChatNames('Ich bestätige, dass '+relation+' Mira Beispiel mit Ihnen sprechen darf.',patients),[]);});

test('requires the complete surname plus a given name, or surname plus matching birth date',()=>{
 const p={id:'a',vorname:'Mira',nachname:'Beispiel Muster',geburtsdatum:'2010-05-02'};
 assert.equal(matchChatNames('Mira Beispiel',[p]).length,0);
 assert.equal(matchChatNames('Beispiel Muster, 02.05.2010',[p]).length,1);
 assert.equal(matchChatNames('Beispiel Muster, 03.05.2010',[p]).length,0);
 assert.equal(matchChatNames('Mira 02.05.2010',[p]).length,0);
});
test('a linked guardian signature retains the confirmed child sheet, never an unrelated first-name match',()=>{
 const child={id:'child',vorname:'Amir',nachname:'Muster',versicherter_vorname:'Nora',versicherter_nachname:'Anders'};
 const wrong={id:'wrong',vorname:'Nora',nachname:'Beispiel'};
 assert.equal(matchChatNames('LG Nora Anders',[wrong]).length,0);
 const match=linkedSenderMatch('Ist die Rechnungs-Mail von Ihnen? LG Nora Anders',[child],['child']);
 assert.equal(match?.context.patientId,'child');assert.equal(match?.context.source,'linked_relative');assert.equal(match?.context.confirmed,true);
 assert.equal(linkedSenderMatch('LG Nora Anders',[child],[])?.context.confirmed,false);
 assert.equal(linkedSenderMatch('LG Nora Anders',[child,{...child,id:'sibling'}],['child','sibling'])?.context.status,'ambiguous');
 assert.equal(senderDeclaration('LG Nora Anders'),'Nora Anders');
});
test('second guardian and active invoice recipients are local sender relations',()=>{
 const p={id:'a',vorname:'Alex',nachname:'Beispiel',eb2_vorname:'Mira',eb2_nachname:'Anders',recipients:['Leon Muster']};
 for(const name of ['Mira Anders','Leon Muster'])assert.equal(linkedSenderMatch('LG '+name,[p],['a'])?.context.patientId,'a');
 assert.equal(linkedSenderMatch('LG Leon',[p],['a']),null);
});
test('a stored first-name-only provisional link cannot be reused on a follow-up',async()=>{
 const patient={id:'wrong',vorname:'Mira',nachname:'Beispiel'};let writes=0;
 const db={from(table:string){let single=false;const q:any=new Proxy({}, {get(_t,key){if(key==='then')return (resolve:any)=>resolve({error:null,data:table==='animahost_chat_identity_links'?[{status:'provisional',patient_id:'wrong',matched_name:'Mira'}]:single?patient:[patient]});if(key==='single')return ()=>{single=true;return q;};if(['upsert','insert','update'].includes(String(key)))return ()=>{writes++;return q;};return ()=>q;}});return q;}};
 const result=await resolveChatName(db as any,{tenant:'t',chat:'c',phone:'p',message:'Und was ist mit der Mail?',readOnly:true});
 assert.equal(result.context.status,'unmatched');assert.equal(writes,0);
});

test('child subjects find shortened and compound names without changing sender matching',async()=>{
 const {subjectNameText,matchSubjectNames,subjectNameResolution}=await import('../animahost-name-match');
 const rows=[{id:'short',vorname:'Leo',nachname:'Navarro',geburtsdatum:'2014-05-07'},{id:'long',vorname:'Leo Daniel',nachname:'Navarro Torres',geburtsdatum:'2014-05-07'},{id:'wrong',vorname:'Leo',nachname:'Anders'}];
 const text='Guten Morgen, mein Sohn Leo Daniel Navarro hat heute einen Termin.';
 assert.equal(subjectNameText(text),'Leo Daniel Navarro');assert.equal(matchChatNames(text,rows).length,0);
 assert.deepEqual(matchSubjectNames(text,rows).map(m=>m.patient.id),['short','long']);
 const known=subjectNameResolution(text,rows,['long']);assert.equal(known?.context.patientId,'long');assert.equal(known?.context.confirmed,true);assert.equal(known?.context.role,'subject');
 const duplicate=subjectNameResolution(text,rows);assert.equal(duplicate?.context.status,'ambiguous');assert.equal(duplicate?.context.possibleDuplicate,true);assert.equal(duplicate?.patient,null);assert.doesNotMatch(duplicate!.context.question!,/Geburtsdatum/);
 assert.equal(subjectNameResolution('Mein Sohn Leo hat einen Termin.',rows),null);
});
test('partial surname alone cannot select an unverified record and DOB separates distinct children',async()=>{
 const {subjectNameResolution}=await import('../animahost-name-match');
 const rows=[{id:'one',vorname:'Leo Daniel',nachname:'Navarro Torres',geburtsdatum:'2014-05-07'},{id:'two',vorname:'Leo',nachname:'Navarro',geburtsdatum:'2012-05-07'}];
 assert.equal(subjectNameResolution('Mein Sohn Leo Navarro hat einen Termin.',[rows[0]])?.context.status,'ambiguous');
 assert.equal(subjectNameResolution('Mein Sohn Leo Navarro, geboren 07.05.2012.',rows)?.context.patientId,'two');
 assert.equal(subjectNameResolution('Mein Sohn Leo Anders hat einen Termin.',rows),null);
});
test('a treatment date is not a birth-date filter and two verified candidates stay unresolved',async()=>{
 const {subjectNameResolution}=await import('../animahost-name-match');
 const p={id:'one',vorname:'Leo Daniel',nachname:'Navarro',geburtsdatum:'2014-05-07'};
 assert.equal(subjectNameResolution('Mein Sohn Leo Navarro hat am 25.11.2026 einen Termin.',[p])?.context.patientId,'one');
 assert.equal(subjectNameResolution('Mein Sohn Leo Navarro kommt später.',[p,{...p,id:'two'}],['one','two'])?.context.status,'ambiguous');
});
test('compound surnames, inverted names, particles and grandchildren are recognized',async()=>{
 const {subjectNameResolution,subjectNameText}=await import('../animahost-name-match');
 const p={id:'a',vorname:'Mira Elena',nachname:'de la Cruz-Muster'};
 for(const text of ['Meine Tochter Mira Elena de la Cruz-Muster kommt später.','Mein Enkel: de la Cruz-Muster, Mira Elena kommt später.','Unser Kind Cruz-Muster, Mira Elena hat einen Termin.']){
  assert.equal(subjectNameResolution(text,[p],['a'])?.context.patientId,'a',text);
 }
 assert.equal(subjectNameText('Mein Bruder Leon Muster darf mit Ihnen kommunizieren.'),null);
 assert.equal(subjectNameText('Es geht um einen Termin für meine Mutter Nora Beispiel.'),'Nora Beispiel');
});
test('one spelling error finds candidates but never proves a name, including a previously linked ID',async()=>{
 const {subjectNameResolution}=await import('../animahost-name-match');const p={id:'a',vorname:'Mira',nachname:'Beispiel'};
 for(const text of ['Meine Tochter Mira Beispeil hat einen Termin.','Meine Tochter Mira Beispel hat einen Termin.']){
  const r=subjectNameResolution(text,[p],['a']);assert.equal(r?.context.status,'ambiguous');assert.equal(r?.patient,null);
 }
 assert.equal(subjectNameResolution('Meine Tochter Mara Beispiele hat einen Termin.',[p]),null);
});
test('short sequential answers preserve the named child but explicit switches and stale history do not',async()=>{
 const {identityMessageForTurn,subjectNameResolution}=await import('../animahost-name-match');
 const patients=[{id:'a',vorname:'Leo',nachname:'Navarro'},{id:'b',vorname:'Mira',nachname:'Navarro'}];
 const history=[{direction:'incoming',text:'Mein Sohn Leo Navarro kommt zu spät.',at:'2026-11-25T09:00:00Z'},{direction:'outgoing',text:'Wie viele Minuten später?',at:'2026-11-25T09:01:00Z'}];
 const message=identityMessageForTurn('Etwa 20 Minuten.',history,'2026-11-25T09:02:00Z');assert.equal(subjectNameResolution(message,patients,['a','b'])?.context.patientId,'a');
 const switched=identityMessageForTurn('Meine Tochter Mira Navarro kommt auch.',history,'2026-11-25T09:03:00Z');assert.equal(subjectNameResolution(switched,patients,['a','b'])?.context.patientId,'b');
 for(const text of ['Es geht jetzt um mich. Für mich brauche ich einen Termin.','Mein Name ist Nora Muster.','Meine Tochter Mira kommt später.'])assert.equal(identityMessageForTurn(text,history,'2026-11-25T09:03:00Z'),text);
 assert.equal(identityMessageForTurn('20 Minuten',history,'2026-11-27T09:03:00Z'),'20 Minuten');
});
test('shared surname particles alone never create a matching candidate',async()=>{
 const {subjectNameResolution}=await import('../animahost-name-match');
 const p={id:'a',vorname:'Mira',nachname:'de la Cruz'};
 assert.equal(subjectNameResolution('Meine Tochter Mira de la Torre kommt.',[p],['a']),null);
 assert.equal(subjectNameResolution('Meine Tochter Mira Cruz kommt.',[p],['a'])?.context.patientId,'a');
});
test('explicit birth date is selected independently of an earlier treatment date',async()=>{
 const {subjectNameResolution}=await import('../animahost-name-match');
 const p={id:'a',vorname:'Leo',nachname:'Navarro',geburtsdatum:'2014-05-07'};
 assert.equal(subjectNameResolution('Mein Sohn Leo Navarro hat am 25.11.2026 einen Termin, geboren am 07.05.2014.',[p],['a'])?.context.patientId,'a');
});
test('a child surname never becomes an unsupported parent salutation',async()=>{
 const {removeInferredParentSalutation}=await import('../animahost-name-match');const p={id:'a',vorname:'Leo',nachname:'Navarro'};
 assert.equal(removeInferredParentSalutation('Danke, Frau Navarro! Wie viel später kommt Leo?','Mein Sohn Leo Navarro kommt später.',p).text,'Danke! Wie viel später kommt Leo?');
 assert.equal(removeInferredParentSalutation('Danke, Frau Navarro!','Mein Sohn Leo Navarro kommt später. Grüße Mira Navarro',p).removed.length,0);
 assert.equal(removeInferredParentSalutation('Danke, Frau Navarro!','Termin für meine Mutter Mira Navarro.',p).removed.length,0);
});
