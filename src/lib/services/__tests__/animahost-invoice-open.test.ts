import assert from 'node:assert/strict';
import test from 'node:test';
import {t} from '@/lib/i18n';
import {identifyByBirthDate} from '../animahost-chat-identity';
import {cannotOpenInvoice,invoicePortalIntent} from '../animahost-quality-workflows';

// 22.11.2026, Test am Praxishandy: „Irgendwie kann ich die Rechnungen in der App nicht öffnen“ bekam die Auskunft, wo Rechnungen
// und Dokumente liegen. Der Patient musste antworten: „Ja das hab ich schon verstanden …“. Alle Namen und Daten hier sind erfunden.
test('an invoice that will not open is a fault, never a question about where invoices are',()=>{
 for(const text of ['Irgendwie kann ich die Rechnungen in der App nicht öffnen',
  'Ja das hab ich schon verstanden aber ich versuche es ja gerade unter Rechnungen zu öffnen aber da kommt eine Fehlermeldung',
  'Beim Öffnen der Rechnung kommt ein Fehler','Ich kann die Rechnung nicht aufmachen','Die Rechnung lässt sich nicht herunterladen',
  'Die Rechnung öffnet sich nicht','Die Rechnung geht nicht auf','Der Download der Rechnung funktioniert nicht','I can’t open the invoice','No puedo abrir la factura']){
  assert.equal(cannotOpenInvoice(text),true,text);
  assert.equal(invoicePortalIntent(text),'missing',text);
 }
 // Keine Störung beim Öffnen: Fragen nach dem Ort, nach dem Weg, zum Inhalt und der Wunsch nach Papier.
 for(const text of ['Wo finde ich meine Rechnung?','Wie kann ich die Rechnung herunterladen?','In der Rechnung ist ein Fehler, der Betrag stimmt nicht.',
  'Gehört die Rechnung unter Dokumente?','Vielen Dank für die Rechnung.','Die Praxis öffnet am Dienstag, die Rechnung bringe ich mit.'])assert.equal(cannotOpenInvoice(text),false,text);
 assert.equal(invoicePortalIntent('Wo finde ich meine Rechnung?'),'location');
});

test('the identification request asks for name and date of birth only, never for a patient number',()=>{
 for(const language of ['de','en','es']){
  const text=t('animahost.quality.identify',language);
  assert.doesNotMatch(text,/patientennummer|patient number|número de paciente/i,language);
  assert.match(text,/Geburtsdatum|date of birth|fecha de nacimiento/,language);
 }
});

const rows=[{id:'10000000-0000-4000-8000-000000000001',vorname:'Max',nachname:'Muster',geburtsdatum:'2010-02-01',geschlecht:'m',ivoris_nummer:'004711'},
 {id:'10000000-0000-4000-8000-000000000002',vorname:'Mia',nachname:'Muster',geburtsdatum:'2010-02-01',geschlecht:'w',ivoris_nummer:'004712'},
 {id:'10000000-0000-4000-8000-000000000003',vorname:'Noah Elias',nachname:'Beispiel-Probe',geburtsdatum:'2011-03-04',geschlecht:'m',ivoris_nummer:'004713'}];
const db={from(){
 let day='';
 const chain={select:()=>chain,eq:(_:string,value:string)=>{day=value;return chain;},limit:async()=>({data:rows.filter(row=>row.geburtsdatum===day),error:null})};
 return chain;
}} as never;

test('patients are identified from a natural sentence, with the full name and the date of birth both required',async()=>{
 const found=async(text:string)=>(await identifyByBirthDate(db,text,[]))?.id??null;
 assert.equal(await found('Max Muster 01.02.2010'),rows[0].id);
 assert.equal(await found('Muster, Max, 01.02.2010'),rows[0].id);
 assert.equal(await found('Mein Sohn Max Muster, geboren am 01.02.2010'),rows[0].id);
 assert.equal(await found('Der Patient heißt Max Muster und ist am 1.2.2010 geboren. In der App kommt „Dokument nicht verfügbar“.'),rows[0].id);
 assert.equal(await found('Noah Elias Beispiel-Probe, 04.03.2011'),rows[2].id);
 assert.equal(await found('Noah Beispiel-Probe, 04.03.2011'),rows[2].id);
 assert.equal(await found('Noah Beispiel, 04.03.2011'),null);
 assert.equal(await found('004711 01.02.2010'),rows[0].id);
 // Nur der Nachname, ein falscher Vorname, beide Geschwister genannt oder ein anderes Datum: niemand.
 assert.equal(await found('Muster 01.02.2010'),null);
 assert.equal(await found('Familie Muster, geboren am 01.02.2010'),null);
 assert.equal(await found('Tom Muster 01.02.2010'),null);
 assert.equal(await found('Max und Mia Muster, beide 01.02.2010'),null);
 assert.equal(await found('Max Muster 02.02.2010'),null);
 assert.equal(await found('Max Muster'),null);
});
