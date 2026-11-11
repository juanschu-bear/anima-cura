import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
import * as consistency from '../../scribe-consistency-service';
import * as identity from '../../scribe-identity';
import * as rooms from '../../scribe-rooms';
import * as billing from '../../billing-foundation';
import * as i18n from '../../i18n';
import * as dayGuard from '../../scribe-entry-day-guard';
import * as monitor from '../../scribe-confirmation-monitor';

// Execute the actual route with a session-bound synthetic DB. No live keys,
// runtime import hacks in production, or writes to real patient data.
function harness(path: string, options:{broken?:boolean;authenticated?:boolean;allowed?:boolean;sourceFails?:boolean;existingDay?:boolean;canonicalDay?:boolean;historyChanged?:boolean;historyMarker?:boolean}={}) {
  const template={id:'template-test',behandlungsart:'multiband',termin_typ:'kontrolle',
    struktur:{template:['MB-Kontrolle. ',{g:'bogen_ok'}],groups:{bogen_ok:{type:'single',opts:[{t:'Bogenwechsel OK 016.'}]}}},
    positionen:[{code:'BEMA 128a',text:'Belegte Bogenleistung',if:{g:options.broken?'bogen':'bogen_ok',i:0}}]};
  const body={patient_id:'patient-test',vorlage_id:template.id,behandlungsart:'multiband',termin_typ:'kontrolle',
    zimmer_version_id:'11111111-1111-4111-8111-111111111111',text:'MB-Kontrolle. Bogenwechsel OK 016.',
    auswahl:{kontrolle:{bogen_ok:[0]}},variablen:{},zaehne:[],positionen:[{code:'BEMA 128a',text:'Belegte Bogenleistung',anzahl:1}]};
  const writes:unknown[]=[];const reads:string[]=[];
  const stored={...body,variablen:options.historyMarker?{template_history_version:1}:{},id:'entry-test',status:'bestaetigt',version:1,bestaetigt_am:'2026-10-31T12:00:00Z'};
  const db={auth:{getUser:async()=>({data:{user:options.authenticated===false?null:{id:'staff-test'}}})},from(table:string){
    reads.push(table);let listed=false;let changes:Record<string,unknown>={};
    const result=()=>({error:options.sourceFails&&table==='doku_vorlagen'?{message:'secret'}:null,
      data:table==='user_profiles'?{role:'admin',kuerzel:'MS',permissions:{scribe_schreiben:options.allowed!==false}}
        :table==='doku_tagesdatensaetze'?(options.canonicalDay?{id:'day-test'}:null):table==='doku_eintraege'&&listed?(options.existingDay?[stored]:[]):table==='doku_vorlagen'?[template]:table==='doku_vorlagen_optionen'?[]:{...stored,...changes}});
    const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},limit(){listed=true;return q;},neq(){return q;},maybeSingle(){return Promise.resolve(result());},range(){return Promise.resolve(result());},
      single(){return Promise.resolve(result());},insert(value:Record<string,unknown>){writes.push({table,insert:value});changes=value;return q;},
      update(value:Record<string,unknown>){writes.push({table,update:value});changes=value;return q;},
      then(resolve:(v:unknown)=>unknown){return Promise.resolve(result()).then(resolve);}};
    return q;
  }};
  const templateSlots=Object.entries(template.struktur.groups).flatMap(([gruppe,group])=>group.opts.map((option,index)=>({
    option_key:`${template.id}:praxis-schubert:${gruppe}:seed:${index}`,template_id:template.id,gruppe,option_index:index,
    source:'vorlage',practice_option_id:null,baseline:{text:option.t,hidden:false},
    state:options.historyChanged&&gruppe==='bogen_ok'&&index===0?{text:'Später umbenannt',hidden:true}:{text:option.t,hidden:false},
    last_change_id:null,created_at:'2026-10-01T00:00:00Z',
  })));
  const monitorDb={from(table:string){
    const result=()=>({data:table==='scribe_option_slots'?templateSlots:table==='scribe_option_changes'?[]:null,error:null});
    const q={select(){return q;},eq(){return q;},in(){return q;},lte(){return q;},order(){return q;},
      range(){return Promise.resolve(result());},insert:async()=>({data:null,error:null})};
    return q;
  }};
  const imports:Record<string,unknown>={'next/server':{NextRequest,NextResponse},'@/lib/db/supabase-server':{createServerComponentClient:()=>db},
    '@/lib/db/supabase':{createServerClient:()=>monitorDb},'@/lib/scribe-confirmation-monitor':monitor,
    '@/lib/scribe-consistency-service':consistency,'@/lib/scribe-identity':identity,'@/lib/scribe-rooms':rooms,
    '@/lib/scribe-entry-day-guard':dayGuard,'@/lib/scribe-room-api':{},'@/lib/billing-foundation':billing,'@/lib/i18n':i18n};
  const code=ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{} as Record<string,(...args:any[])=>Promise<Response>>};
  new Function('require','module','exports',code)((id:string)=>{assert.ok(id in imports,`unexpected dependency ${id}`);return imports[id];},mod,mod.exports);
  return {handle:mod.exports,writes,reads,body,stored};
}
const entry='src/app/api/doku/eintrag/route.ts';
const version='src/app/api/doku/eintrag/[id]/version/route.ts';
const exportPath='src/app/api/doku/eintrag/[id]/billing-export/route.ts';
const request=(body:unknown)=>new NextRequest('https://example.invalid/api/doku/eintrag',{method:'POST',body:JSON.stringify(body),headers:{'Content-Type':'application/json'}});

test('confirmation and draft promotion reject broken mapping before any entry/history write',async()=>{
  for(const entwurf_id of [undefined,'draft-test']){
    const f=harness(entry,{broken:true});const response=await f.handle.POST(request({...f.body,entwurf_id,bestaetigen:true,canConfirm:true}));
    assert.equal(response.status,422);assert.deepEqual(f.writes,[]);
    const json=await response.json();assert.equal(json.status,'needs_consistency_review');
    const issue=json.consistency.issues.find((i:{code:string})=>i.code==='template_rule_reference_invalid');
    assert.match(issue.message,/Positionsregel/);assert.equal(issue.module,'kontrolle');assert.equal(issue.group,'bogen');
  }
});
test('draft saving remains possible without a successful consistency review',async()=>{
  const f=harness(entry,{broken:true});const response=await f.handle.POST(request({...f.body,bestaetigen:false,text:''}));
  assert.equal(response.status,201);assert.equal(f.writes.length,1);
  assert.equal((await response.json()).eintrag.status,'entwurf');assert.ok(!f.reads.includes('doku_vorlagen'));
});
test('valid confirmation keeps the existing entry/history flow',async()=>{
  const f=harness(entry);const response=await f.handle.POST(request(f.body));assert.equal(response.status,201);assert.equal(f.writes.length,2);
});
test('text-only correction validates retained positions instead of trusting previous confirmation',async()=>{
  const f=harness(version);const response=await f.handle.POST(request({text:'MB-Kontrolle. Kein Wechsel OK.',aenderungsgrund:'Korrektur'}),{params:{id:'entry-test'}});
  assert.equal(response.status,422);assert.equal(f.writes.length,0);
});
test('valid new version remains possible and old entry is not silently overwritten by validation',async()=>{
  const f=harness(version);const response=await f.handle.POST(request({...f.body,aenderungsgrund:'Korrektur'}),{params:{id:'entry-test'}});
  assert.equal(response.status,200);assert.equal((await response.json()).eintrag.version,2);assert.equal(f.writes.length,2);
});
test('historical confirmed entries with broken mappings cannot export positions',async()=>{
  const f=harness(exportPath,{broken:true});const response=await f.handle.GET(new Request('https://example.invalid/api/doku/eintrag/entry-test/billing-export'),{params:{id:'entry-test'}});
  assert.equal(response.status,422);const json=await response.json();assert.equal(json.copy_text,undefined);assert.equal(f.writes.length,0);
});
test('consistent individual positions export as manual transfer only',async()=>{
  const f=harness(exportPath);const response=await f.handle.GET(new Request('https://example.invalid/api/doku/eintrag/entry-test/billing-export'),{params:{id:'entry-test'}});
  assert.equal(response.status,200);assert.equal((await response.json()).status,'manual_transfer_required');assert.equal(f.writes.length,0);
});
test('confirmed export uses the confirmation state after later rename/hide, with and without a history marker',async()=>{
  for(const historyMarker of [false,true]){
    const f=harness(exportPath,{historyChanged:true,historyMarker});
    const response=await f.handle.GET(new Request('https://example.invalid/api/doku/eintrag/entry-test/billing-export'),{params:{id:'entry-test'}});
    assert.equal(response.status,200);assert.equal((await response.json()).status,'manual_transfer_required');
    assert.equal(f.writes.length,0);
  }
});
test('all guarded routes enforce login and permission before loading template data',async()=>{
  for(const path of [entry,version,exportPath])for(const denied of [{authenticated:false},{allowed:false}]){
    const f=harness(path,denied);const response=await (path===exportPath?f.handle.GET:f.handle.POST)(request(f.body),{params:{id:'entry-test'}});
    assert.equal(response.status,denied.authenticated===false?401:403);assert.equal(f.writes.length,0);assert.ok(!f.reads.includes('doku_vorlagen'));
  }
});
test('an unavailable validation source never allows confirmation',async()=>{
  const f=harness(entry,{sourceFails:true});const response=await f.handle.POST(request(f.body));
  assert.equal(response.status,503);assert.equal(f.writes.length,0);assert.doesNotMatch(await response.text(),/secret/);
});
test('every issue in a 422 response contains a readable practice message',async()=>{
  const f=harness(entry,{broken:true});const response=await f.handle.POST(request(f.body));
  const json=await response.json();assert.equal(response.status,422);
  assert.ok(json.consistency.issues.length>0);
  assert.ok(json.consistency.issues.every((issue:{message?:string})=>typeof issue.message==='string'&&issue.message.length>20));
});

test('confirmed duplicate gets 409 with existing entry while draft is still saved',async()=>{
 const f=harness(entry,{existingDay:true});const r=await f.handle.POST(request(f.body));assert.equal(r.status,409);const body=await r.json();assert.equal(body.code,'day_record_exists');assert.equal(body.eintrag.id,'entry-test');assert.equal(f.writes.length,0);
 const g=harness(entry,{existingDay:true});assert.equal((await g.handle.POST(request({...g.body,bestaetigen:false}))).status,201);
});
test('legacy version route rejects canonical content and supplies day correction path',async()=>{
 const f=harness(version,{canonicalDay:true});const r=await f.handle.POST(request({...f.body,aenderungsgrund:'Korrektur'}),{params:{id:'entry-test'}});assert.equal(r.status,409);const b=await r.json();assert.equal(b.code,'day_record_correction_required');assert.equal(b.dayRecordId,'day-test');assert.equal(f.writes.length,0);
});
