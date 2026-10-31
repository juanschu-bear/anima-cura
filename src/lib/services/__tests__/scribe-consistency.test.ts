import test from 'node:test';
import assert from 'node:assert/strict';
import { assessScribeConsistency, type ScribeConsistencyInput, type ScribeConsistencyTemplate } from '../../scribe-consistency';
import { checkScribeConsistency, scribeConsistencyFailure } from '../../scribe-consistency-service';

// Hypothetical template mapping for regression tests, not a practice tariff.
export function fixture() {
  const template: ScribeConsistencyTemplate = {
    id:'template-test',behandlungsart:'multiband',termin_typ:'kontrolle',
    struktur:{template:['MB-Kontrolle. ',{g:'bogen_ok'},{g:'bogen_uk'}],groups:{
      bogen_ok:{type:'single',opts:[{t:'Kein Wechsel OK.'},{t:'Bogenwechsel OK 016.'}]},
      bogen_uk:{type:'single',opts:[{t:'Kein Wechsel UK.'},{t:'Bogenwechsel UK 016.'}]},
    }},
    positionen:[{code:'BEMA 128a',text:'Belegte Bogenleistung',if:{g:'bogen_ok',i:1}},
      {code:'BEMA 128a',text:'Belegte Bogenleistung',if:{g:'bogen_uk',i:1}},
      {code:'BEMA 119/120',text:'Quartalsvorschlag'}],
  };
  const input: ScribeConsistencyInput = {
    vorlage_id:template.id,behandlungsart:template.behandlungsart,termin_typ:template.termin_typ,
    text:'MB-Kontrolle. Bogenwechsel OK 016. Kein Wechsel UK. NT: Kontrolle.',
    auswahl:{kontrolle:{bogen_ok:[1],bogen_uk:[0]}},variablen:{},zaehne:[],
    positionen:[{code:'BEMA 128a',text:'Belegte Bogenleistung',anzahl:1},{code:'BEMA 119/120',text:'Quartalsvorschlag',anzahl:1}],
  };
  return {template,input};
}
const codes = (input: unknown, template: unknown) => assessScribeConsistency(input,[template]).issues.map(i=>i.code);

test('correctly bound synthetic proposal passes consistency but never approves billing',()=>{
  const {input,template}=fixture();
  const before=structuredClone({input,template});
  const result=assessScribeConsistency(input,[template]);
  assert.equal(result.canConfirm,true);assert.equal(result.billingApproved,false);
  assert.equal(result.status,'no_detected_conflict');
  assert.deepEqual({input,template},before);
});
test('reported old bogen/0 reference blocks instead of silently dropping the wire line',()=>{
  const {input,template}=fixture();template.positionen[0].if={g:'bogen',i:0};input.positionen.shift();
  assert.ok(codes(input,template).includes('template_rule_reference_invalid'));
  assert.ok(codes(input,template).includes('wire_position_unmapped'));
});
test('missing positions, wrong amounts, changed descriptions and extra codes cannot pass',()=>{
  for (const mutate of [
    (i:ScribeConsistencyInput)=>{i.positionen.shift();},
    (i:ScribeConsistencyInput)=>{i.positionen[0].anzahl=2;},
    (i:ScribeConsistencyInput)=>{i.positionen[0].text='Andere Leistung';},
    (i:ScribeConsistencyInput)=>{i.positionen.push({...i.positionen[0]});},
  ]) {const {input,template}=fixture();mutate(input);assert.equal(assessScribeConsistency(input,[template]).canConfirm,false);}
});
test('opposite jaw, removed text and altered selected option text are rejected',()=>{
  for(const text of ['MB-Kontrolle. Bogenwechsel UK 016. Kein Wechsel UK.','MB-Kontrolle.','MB-Kontrolle. Bogenwechsel OK 018. Kein Wechsel UK.']){
    const {input,template}=fixture();input.text=text;assert.ok(codes(input,template).includes('selected_text_missing'));
  }
});
test('unmapped wire change in free text and unknown jaw require review even with a quarter line',()=>{
  for(const text of ['Bogenwechsel OK 016.','Bogenwechsel 016.']){
    const {input,template}=fixture();input.auswahl.kontrolle.bogen_ok=[0];input.positionen.shift();
    input.text='MB-Kontrolle. Kein Wechsel OK. Kein Wechsel UK. '+text;
    assert.equal(assessScribeConsistency(input,[template]).canConfirm,false);
  }
});
test('no change is not an affirmative wire event; planning is not performed treatment',()=>{
  const {input,template}=fixture();input.auswahl.kontrolle.bogen_ok=[0];input.positionen.shift();
  input.text='MB-Kontrolle. Kein Wechsel OK. Kein Wechsel UK. Bogenwechsel OK 016 geplant.';
  assert.equal(assessScribeConsistency(input,[template]).canConfirm,true);
  input.positionen.unshift({code:'BEMA 128a',text:'Belegte Bogenleistung',anzahl:1});
  assert.ok(codes(input,template).includes('wire_position_without_performed_change'));
});
test('contradicting negation is not hidden by presence of the positive substring',()=>{
  const {input,template}=fixture();input.text+=' Kein Wechsel OK.';
  assert.ok(codes(input,template).includes('wire_text_conflict'));
});
test('a future planned change does not contradict a completed change of the same jaw',()=>{
  const {input,template}=fixture();input.text+=' NT: Bogenwechsel OK 018 geplant.';
  assert.equal(assessScribeConsistency(input,[template]).canConfirm,true);
});
test('both jaws require their two bindings and two rows, not a duplicated quarter suggestion',()=>{
  const {input,template}=fixture();input.auswahl.kontrolle.bogen_uk=[1];input.text='MB-Kontrolle. Bogenwechsel OK 016. Bogenwechsel UK 016.';
  assert.ok(codes(input,template).includes('expected_position_missing'));
  input.positionen.push({...input.positionen[0]});assert.equal(assessScribeConsistency(input,[template]).canConfirm,true);
});
test('a single unconditioned wire row cannot cover both jaws with quantity one',()=>{
  const {input,template}=fixture();template.positionen=[{code:'BEMA 128a',text:'Belegte Bogenleistung'}];
  input.positionen=[input.positionen[0]];input.auswahl.kontrolle.bogen_uk=[1];input.text='MB-Kontrolle. Bogenwechsel OK 016. Bogenwechsel UK 016.';
  assert.ok(codes(input,template).includes('wire_jaw_quantity_unproven'));
});
test('invalid references and hidden groups are configuration failures regardless of client positions',()=>{
  const {input,template}=fixture();template.positionen[0].if!.i=100;
  assert.ok(codes(input,template).includes('template_rule_reference_invalid'));
  template.positionen[0].if!.i=1;template.struktur.template=['MB-Kontrolle. ',{g:'missing'}];
  assert.ok(codes(input,template).includes('template_text_reference_invalid'));
  assert.ok(codes(input,template).includes('position_without_text_binding'));
});
test('malformed or duplicate selection is not repaired; posted review flags have no authority',()=>{
  for(const selection of ([{bogen_ok:[100]},{bogen_ok:[-1]},{bogen_ok:[1,1]},{bogen_ok:[0,1]},{old:[0]}] as Array<Record<string,number[]>>)) {
    const {input,template}=fixture();input.auswahl={kontrolle:selection};
    assert.equal(assessScribeConsistency({...input,canConfirm:true,bypass:true},[template]).canConfirm,false);
  }
});
test('quantity-by-teeth needs actual teeth; no Math.max(1, missing) assumption',()=>{
  const {input,template}=fixture();template.positionen[0].count='zaehne';
  assert.ok(codes(input,template).includes('position_quantity_unproven'));
  input.zaehne=['16'];assert.equal(assessScribeConsistency(input,[template]).canConfirm,true);
  input.zaehne=['16','16'];assert.ok(codes(input,template).includes('teeth_duplicate'));
});
test('templates, variables and posted payload shape cannot be silently replaced with empty values',()=>{
  const {input,template}=fixture();
  assert.equal(assessScribeConsistency({...input,text:42},[template]).canConfirm,false);
  assert.equal(assessScribeConsistency(input,[]).canConfirm,false);
  assert.equal(assessScribeConsistency(input,[template,template]).canConfirm,false);
  assert.equal(assessScribeConsistency({...input,vorlage_id:'other'},[template]).canConfirm,false);
  template.struktur.groups.bogen_ok.opts[1].t='Bogenwechsel OK {bogen}.';
  assert.ok(codes(input,template).includes('text_variable_unresolved'));
  input.variablen.bogen='016';assert.equal(assessScribeConsistency(input,[template]).canConfirm,true);
});
test('stacked modules preserve multiplicities; inactive leftover selections do not add positions',()=>{
  const {input,template}=fixture();const other=structuredClone(template);other.id='second';other.termin_typ='extra';
  input.auswahl.extra=structuredClone(input.auswahl.kontrolle);
  assert.equal(assessScribeConsistency(input,[template]).canConfirm,true);
  input.termin_typ='kontrolle+extra';input.positionen.push(...structuredClone(input.positionen));
  assert.equal(assessScribeConsistency(input,[template,other]).canConfirm,true);
  input.termin_typ='kontrolle+kontrolle';assert.equal(assessScribeConsistency(input,[template]).canConfirm,false);
});
test('free text beyond the rule vocabulary is never advertised as a full clinical audit',()=>{
  const {input,template}=fixture();input.text+=' Zusätzlicher Befund im Freitext.';
  const result=assessScribeConsistency(input,[template]);assert.equal(result.billingApproved,false);
  assert.equal(result.status,'no_detected_conflict');assert.ok(!result.coverage.includes('full_clinical_audit' as never));
});

export function dbFixture(options:{failure?:string;practiceOptions?:unknown[]}={}) {
  const {input,template}=fixture();const reads:Array<{table:string;filters:unknown[]}> = [];
  const db={from(table:string){
    const call={table,filters:[] as unknown[]};reads.push(call);
    const result=()=>({data:table==='doku_vorlagen'?[template]:options.practiceOptions??[],error:options.failure===table?{message:'secret detail'}:null});
    const query={select(){return query;},eq(...v:unknown[]){call.filters.push(v);return query;},in(...v:unknown[]){call.filters.push(v);return query;},order(){return query;},limit(){return Promise.resolve(result());},range(){return Promise.resolve(result());}};
    return query;
  }};
  return {db:db as never,input,template,reads};
}
test('server uses session-scoped current templates and appended practice options without mutation',async()=>{
  const f=dbFixture({practiceOptions:[{id:'option',termin_typ:'kontrolle',gruppe:'bogen_uk',text:'Kein Wechsel UK.'}]});
  f.input.auswahl.kontrolle.bogen_uk=[2];
  assert.equal((await checkScribeConsistency(f.db,f.input)).canConfirm,true);
  assert.equal(f.template.struktur.groups.bogen_uk.opts.length,2);
  assert.ok(f.reads.some(r=>r.filters.some(v=>JSON.stringify(v).includes('praxis_id'))));
});
test('read failures fail closed with 503 and never disclose source errors',async()=>{
  for(const table of ['doku_vorlagen','doku_vorlagen_optionen']){
    const f=dbFixture({failure:table});const result=await checkScribeConsistency(f.db,f.input);
    assert.equal(result.canConfirm,false);
    const response=scribeConsistencyFailure(result,'https://example.invalid/api/doku/eintrag?lang=en');
    assert.equal(response.status,503);assert.match(response.headers.get('cache-control')!,/no-store/);
    assert.doesNotMatch(await response.text(),/secret detail/);
  }
});
test('invalid input fails before source access and returns actionable machine fields',async()=>{
  const f=dbFixture();const result=await checkScribeConsistency(f.db,{...f.input,positionen:null});
  assert.equal(f.reads.length,0);const response=scribeConsistencyFailure(result,'https://example.invalid');
  assert.equal(response.status,422);assert.equal((await response.json()).status,'needs_consistency_review');
});
