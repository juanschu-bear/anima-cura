import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContactPhone,patientHasContactPhone,renderNoticeTemplate,validateNoticeTemplate}
 from '../animahost-contact-notices';

test('German domestic and international phone formats identify the same parent number',()=>{
 assert.equal(normalizeContactPhone('0179 5351813'),'491795351813');
 assert.equal(normalizeContactPhone('+49 179 5351813'),'491795351813');
 assert.equal(patientHasContactPhone({id:'p',vorname:'Lena',nachname:'Meyer',
  versicherter_telefon:'0179 5351813'},'491795351813'),true);
});
test('notice templates use the selected patient and date in formal German',()=>{
 const body='Guten Tag {name}, Ihre Spange kann am {date} um {time} Uhr abgeholt werden.';
 assert.equal(renderNoticeTemplate(body,{vorname:'Lena',nachname:'Meyer'},'2026-11-25','14:30'),
  'Guten Tag Lena Meyer, Ihre Spange kann am 25.11.2026 um 14:30 Uhr abgeholt werden.');
 assert.equal(validateNoticeTemplate('Du kannst deine Spange am {date} holen.'),false);
 assert.throws(()=>renderNoticeTemplate(body,{vorname:'Lena',nachname:'Meyer'},'2026-11-25',null),/time_required/);
 assert.equal(validateNoticeTemplate('Hallo {unknown}'),false);
});
