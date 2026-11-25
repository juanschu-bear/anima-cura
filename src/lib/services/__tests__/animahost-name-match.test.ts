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
