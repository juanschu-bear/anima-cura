import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTariffImport, tariffImportTemplate } from '../../billing-tariff-import';

test('tariff CSV template parses exact decimals without approving or pricing assumptions',()=>{
  const parsed=parseTariffImport(tariffImportTemplate());
  assert.equal(parsed.ok,true);
  if(!parsed.ok)return;
  assert.equal(parsed.tariffs.length,1);
  assert.deepEqual(parsed.tariffs[0],{schedule:'GOZ',code:'6100',sourceReference:'GOZ-Punktwert, freigegeben am TT.MM.JJJJ',validFrom:'2026-01-01',validTo:'2026-12-31',insurerId:null,requiresRegion:false,price:{kind:'points',points:'165',pointValueEuro:'0.0562421'}});
});

test('tariff import fails closed on changed headers, invalid rows and duplicate identities',()=>{
  assert.equal(parseTariffImport('wrong;header\na;b').ok,false);
  const base=tariffImportTemplate();
  assert.equal(parseTariffImport(base+'\nGOZ;6100;GOZ-Punktwert, freigegeben am TT.MM.JJJJ;2026-01-01;2026-12-31;;nein;punkte;165;0,0562421;').ok,false);
  assert.equal(parseTariffImport(base.replace('0,0562421','not-a-number')).ok,false);
});
