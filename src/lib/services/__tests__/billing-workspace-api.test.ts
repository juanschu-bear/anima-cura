import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { billingWorkspaceHandler } from '../../billing-workspace-api';

const actor='00000000-0000-4000-8000-000000000001',patient='00000000-0000-4000-8000-000000000002';
const url='https://example.invalid/api/rechnungen/catalog';
const tariff={sourceReference:'Synthetic source',validFrom:'2026-07-01',validTo:'2026-09-30',schedule:'BEMA',code:'126a',insurerId:'test',requiresRegion:false,price:{kind:'points',points:'10',pointValueEuro:'1.2'}};
const save={action:'save',kind:'tariff',recordId:randomUUID(),expectedRevision:0,reason:'Synthetic source verified',data:tariff};
const service={patientId:patient,source:{system:'scribe',recordId:randomUUID(),version:1,positionIndex:0},serviceDate:'2026-07-05',schedule:'BEMA',code:'126a',description:'Synthetic service',quantity:1,region:null,factor:null,justification:null,insurerId:'test',tariffVersionId:randomUUID()};
type Options={signedIn?:boolean;role?:string|null;permissions?:unknown;failTable?:string;data?:Record<string,unknown>;rpcError?:unknown};
function fixture(options:Options={}){
  let adminCalls=0;
  const calls:{table:string;method:string;args:unknown[]}[]=[],writes:unknown[]=[];
  const client={auth:{getUser:async()=>({data:{user:options.signedIn===false?null:{id:actor,user_metadata:{role:'admin'}}},error:null})},
    from(table:string){
      const result=()=>({data:table==='user_profiles'?{role:options.role===undefined?'admin':options.role,permissions:options.permissions??null}:options.data?.[table]??(table==='billing_requests'?null:[]),error:options.failTable===table?{message:'SECRET DB DETAIL'}:null});
      const query:any={then(resolve:any,reject:any){return Promise.resolve(result()).then(resolve,reject);}};
      for(const method of ['select','eq','gte','lte','in','order','range','or','maybeSingle'])query[method]=(...args:unknown[])=>{calls.push({table,method,args});return query;};
      return query;
    },rpc:async(name:string,args:unknown)=>{writes.push({name,args});return {data:randomUUID(),error:options.rpcError??null};}};
  const handle=billingWorkspaceHandler(()=>client as never,()=>{adminCalls++;return client as never;});
  const post=(body:unknown,headers:Record<string,string>={})=>handle(new Request(url,{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json','idempotency-key':randomUUID(),...headers},body:JSON.stringify(body)}));
  return {handle,post,calls,writes,adminCalls:()=>adminCalls};
}
test('catalog denies unknown, patient and read-only writers before privileged data access',async()=>{
  for(const options of [{signedIn:false},{role:'patient'},{role:null},{permissions:{module:{rechnungen:'lesen'}}}]){
    const f=fixture(options);const res=await f.post(save);
    assert.equal(res.status,options.signedIn===false?401:403);assert.equal(f.adminCalls(),0);assert.equal(f.writes.length,0);
  }
  const read=fixture({permissions:{module:{rechnungen:'lesen'}}});
  const response=await read.handle(new Request(url+'?kind=tariff'));
  assert.equal(response.status,200);assert.equal((await response.json()).writable,false);
});
test('cross-origin and forged approval payloads never invoke the write function',async()=>{
  const f=fixture();
  assert.equal((await f.post(save,{origin:'https://attacker.invalid'})).status,403);
  assert.equal((await f.post(save,{'idempotency-key':'invalid'})).status,400);
  assert.equal((await f.post({action:'approve',versionId:randomUUID(),reason:'Forged amount',grossCents:1})).status,400);
  assert.equal((await f.post({...save,actor:'someone else'})).status,400);
  assert.equal(f.writes.length,0);
});
test('source proposals are scoped, paginated and retain missing quantities',async()=>{
  const entry={id:service.source.recordId,patient_id:patient,version:1,termin_datum:'2026-07-05',status:'bestaetigt',bestaetigt_am:'2026-07-05T10:00:00Z',positionen:[{code:'BEMA 126a',text:'Test'}]};
  const f=fixture({data:{doku_eintraege:Array.from({length:26},(_,i)=>({...entry,id:String(i)}))}});
  const response=await f.handle(new Request(url+`?kind=source&patientId=${patient}&from=2026-07-01&to=2026-09-30`));
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control')!,/no-store/);
  const data=await response.json();assert.equal(data.lines.length,25);assert.equal(data.hasMore,true);assert.equal(data.lines[0].quantity,null);
  assert.ok(f.calls.some(c=>c.table==='doku_eintraege'&&c.method==='eq'&&c.args[0]==='patient_id'&&c.args[1]===patient));
  assert.ok(f.calls.some(c=>c.method==='range'&&c.args[0]===0&&c.args[1]===25));
  assert.equal(f.writes.length,0);
});
test('failed reads and missing head snapshots cannot appear as a successful empty list',async()=>{
  for(const table of ['user_profiles','billing_records','billing_versions']){
    const f=fixture({failTable:table,data:{billing_records:[{id:randomUUID(),head_version:1}]}});
    const response=await f.handle(new Request(url+'?kind=tariff'));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/SECRET/);
  }
  const f=fixture({data:{billing_records:[{id:randomUUID(),head_version:1}]}});
  assert.equal((await f.handle(new Request(url+'?kind=tariff'))).status,503);
});
test('committed identical retry returns its recorded result without a second write',async()=>{
  const id=randomUUID();const f=fixture({data:{billing_requests:{actor_id:actor,request:save,result_id:id}}});
  const response=await f.post(save);assert.deepEqual(await response.json(),{id,replayed:true});assert.equal(f.writes.length,0);
  assert.equal((await f.post({...save,reason:'Changed content'})).status,409);
});
test('service approval calculates money on the server and still delegates source locks to the transaction',async()=>{
  const tariffVersion={id:service.tariffVersionId,record_id:randomUUID(),revision:1,data:tariff,state:'approved'};
  const version={id:randomUUID(),record_id:randomUUID(),revision:1,data:service,state:'draft',tariff_version_id:service.tariffVersionId};
  let lookups=0;
  const f=fixture({data:{billing_records:{kind:'service'},get billing_versions(){return lookups++===0?version:tariffVersion;}}});
  const res=await f.post({action:'approve',versionId:version.id,reason:'Clinically reviewed'});
  assert.equal(res.status,200);
  const write=f.writes[0] as any;assert.equal(write.args.p_actor,actor);assert.equal(write.args.p_input.grossCents,1200);
});
test('source changed and logical duplicate conflicts return useful safe errors',async()=>{
  const f=fixture({data:{patients:{id:patient},doku_eintraege:null}});
  const res=await f.post({...save,kind:'service',data:service});assert.equal(res.status,409);assert.equal(f.writes.length,0);
  const conflict=fixture({rpcError:{code:'23505',message:'SECRET DB DETAIL'}});
  assert.equal((await conflict.post(save)).status,409);
});
