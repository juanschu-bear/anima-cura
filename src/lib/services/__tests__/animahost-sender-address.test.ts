import test from 'node:test';import assert from 'node:assert/strict';
import {isMinorAt,senderAddress,removeChildSalutation} from '../animahost-sender-address';
const child={id:'child',vorname:'Mira',nachname:'Muster',geburtsdatum:'2011-06-12',versicherter_vorname:'Nora',versicherter_nachname:'Anders'};
const context={status:'matched' as const,source:'phone' as const,matchedName:'Mira Muster',patientId:'child',question:null};
const at='2026-11-26T09:00:00Z';
test('minor phone match is a subject, not an inferred sender',()=>{
 const result=senderAddress(context,child,'So machen wir es.',[],at);assert.equal(result.context?.role,'subject');assert.equal(result.avoidPatientSalutation,true);
 assert.equal(senderAddress(context,{...child,geburtsdatum:'1990-01-01'},'Hallo',[],at).avoidPatientSalutation,false);
 assert.equal(isMinorAt('2008-11-26',at),false);assert.equal(isMinorAt('2008-11-27',at),true);assert.equal(isMinorAt(null,at),null);
});
test('explicit self-introduction is allowed; system replies never prove sender identity',()=>{
 assert.equal(senderAddress(context,child,'Ich heiße Mira Muster.',[],at).avoidPatientSalutation,false);
 assert.equal(senderAddress(context,child,'Danke', [{direction:'outgoing',text:'Hallo Mira Muster!',at}],at).avoidPatientSalutation,true);
 assert.equal(senderAddress(context,child,'Mein Kind Mira braucht Hilfe.',[{direction:'incoming',text:'Ich heiße Mira Muster.',at}],at).avoidPatientSalutation,true);
 assert.equal(senderAddress(context,child,'So machen wir es.',[{direction:'incoming',text:'Ich heiße Mira Muster.',at}],at).avoidPatientSalutation,false);
});
test('known mother keeps her different surname; child references stay intact',()=>{
 const result=senderAddress({...context,source:'linked_relative',role:'parent',matchedName:'Nora Anders'},child,'Ja',[],at);assert.equal(result.context?.matchedName,'Nora Anders');assert.equal(result.avoidPatientSalutation,true);
 for(const [before,after] of [['Gern, Mira! Schön, dass Sie schreiben.','Gern! Schön, dass Sie schreiben.'],['Alles klar, Mira! Der Termin für Mira bleibt.','Alles klar! Der Termin für Mira bleibt.'],['Hallo Mira, der Termin für Mira ist morgen.','Hallo, der Termin für Mira ist morgen.'],['Liebe Mira, danke.','danke.'],['Was brauchen Sie, Mira?','Was brauchen Sie?'],['Hallo Frau Muster, danke.','Hallo, danke.']])assert.equal(removeChildSalutation(before,child,true).text,after);
 assert.equal(removeChildSalutation('Hallo Frau Muster, danke.',child,true,'Nora Muster').text,'Hallo Frau Muster, danke.');
 assert.equal(removeChildSalutation('Hallo Frau Anders, es geht um Mira.',child,true).text,'Hallo Frau Anders, es geht um Mira.');
});
