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
test('invoice service reuse returns a useful conflict before any PDF or storage access',async()=>{
  const f=fixture({rpcError:{message:'billing_invoice_service_already_billed'}});
  const response=await f.post({action:'issue_invoice',payerVersionId:randomUUID(),dueDate:'2026-11-07',reason:'Synthetic invoice approval'});
  assert.equal(response.status,409);
  assert.match((await response.json()).error,/Leistung.*bereits.*Rechnung/);
  assert.equal(f.writes.length,1);
});
test('cancellation retries return the committed document without rewriting files or posting twice',async()=>{
  const invoiceId=randomUUID(),documentId=randomUUID();
  const command={action:'cancel_invoice',invoiceId,reason:'Synthetic correction reason'};
  const f=fixture({data:{billing_invoices:{id:invoiceId,status:'void'},billing_invoice_cancellations:{reason:command.reason,document_id:documentId}}});
  const response=await f.post(command);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{id:invoiceId,status:'void',documentId});
  assert.equal(f.writes.length,0);
  assert.equal((await f.post({...command,reason:'Changed cancellation reason'})).status,409);
  const readOnly=fixture({permissions:{module:{rechnungen:'lesen'}}});
  assert.equal((await readOnly.post(command)).status,403);assert.equal(readOnly.adminCalls(),0);
  assert.equal((await f.post({...command,totalCents:0})).status,400);
});
test('abandonment uses one atomic operation without storage or document writes and rejects published invoices',async()=>{
  const command={action:'abandon_invoice',invoiceId:randomUUID(),reason:'Interrupted upload'};
  const f=fixture();const response=await f.post(command);
  assert.equal(response.status,200);assert.equal((await response.json()).status,'void');
  assert.equal(f.writes.length,1);assert.equal((f.writes[0] as any).name,'billing_invoice_abandon');
  const published=fixture({rpcError:{message:'billing_abandonment_already_published'}});
  const blocked=await published.post(command);assert.equal(blocked.status,409);
  assert.match((await blocked.json()).error,/inzwischen ausgestellt/);
  const readonly=fixture({permissions:{module:{rechnungen:'lesen'}}});
  assert.equal((await readonly.post(command)).status,403);assert.equal(readonly.writes.length,0);
});
test('invoice history is scoped to patient and period, paginated, and does not hide read failures',async()=>{
  const records=Array.from({length:16},()=>({id:randomUUID(),status:'void',issued_at:null}));
  const f=fixture({data:{billing_invoices:records,billing_invoice_cancellations:[]}});
  const historyUrl=url+`?kind=invoice_history&patientId=${patient}&from=2026-07-01&to=2026-09-30&page=1`;
  const response=await f.handle(new Request(historyUrl));assert.equal(response.status,200);
  const data=await response.json();assert.equal(data.items.length,15);assert.equal(data.hasMore,true);
  assert.ok(f.calls.some(c=>c.table==='billing_invoices'&&c.method==='eq'&&c.args[0]==='patient_id'&&c.args[1]===patient));
  assert.ok(f.calls.some(c=>c.method==='eq'&&c.args[0]==='snapshot->>periodFrom'&&c.args[1]==='2026-07-01'));
  assert.ok(f.calls.some(c=>c.method==='range'&&c.args[0]===15&&c.args[1]===30));
  assert.equal((await fixture({failTable:'billing_invoices'}).handle(new Request(historyUrl))).status,503);
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
test('billing queue groups confirmed evidence and reports the real review state',async()=>{
  const sourceId=randomUUID(),recordId=randomUUID(),versionId=randomUUID();
  const entry={id:sourceId,patient_id:patient,version:2,termin_datum:'2026-10-20',status:'bestaetigt',bestaetigt_am:'2026-10-20T10:00:00Z',positionen:[{code:'BEMA 126a',text:'Synthetic service',anzahl:1},{code:'GOZ 6100',text:'Missing quantity'}]};
  const record={id:recordId,kind:'service',patient_id:patient,source_system:'scribe',source_record_id:sourceId,source_position_index:0,head_version:1};
  const version={id:versionId,record_id:recordId,revision:1,state:'draft',data:{...service,patientId:patient,source:{system:'scribe',recordId:sourceId,version:2,positionIndex:0},serviceDate:'2026-10-20'},tariff_version_id:service.tariffVersionId};
  const f=fixture({data:{doku_eintraege:[entry],patients:[{id:patient,vorname:'Test',nachname:'Patient',ivoris_nummer:'42',geburtsdatum:'2010-01-01'}],billing_records:[record],billing_versions:[version]}});
  const response=await f.handle(new Request(url+'?kind=queue&page=0'));
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.cases.length,1);assert.equal(data.cases[0].patient.name,'Test Patient');
  assert.equal(data.cases[0].recordedPositions,1);assert.equal(data.cases[0].totalPositions,2);
  assert.equal(data.cases[0].incompletePositions,1);assert.equal(data.cases[0].status,'needs_data');
  assert.ok(f.calls.some(c=>c.table==='doku_eintraege'&&c.method==='range'&&c.args[1]===15));
});
test('bulk preparation creates only evidenced review drafts and never approves them',async()=>{
  const sourceId=randomUUID();
  const entry={id:sourceId,patient_id:patient,version:3,termin_datum:'2026-10-21',status:'bestaetigt',bestaetigt_am:'2026-10-21T10:00:00Z',positionen:[{code:'BEMA 126a',text:'Documented service',anzahl:1},{code:'free text',text:'Unmapped service',anzahl:1}]};
  const f=fixture({data:{doku_eintraege:entry,billing_records:[]}});
  const response=await f.post({action:'prepare_source',sourceId});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{prepared:1,skippedExisting:0,blocked:1,total:2});
  assert.equal(f.writes.length,1);
  const write=f.writes[0] as any;
  assert.equal(write.name,'billing_write');assert.equal(write.args.p_input.action,'save');
  assert.equal(write.args.p_input.data.source.recordId,sourceId);assert.equal(write.args.p_input.data.tariffVersionId,null);
  assert.equal('grossCents' in write.args.p_input,false);
});
test('tariff import is validated and creates drafts only',async()=>{
  const f=fixture({data:{billing_records:[]}});
  const response=await f.post({action:'import_tariffs',tariffs:[tariff]});
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{created:1,revised:0,unchanged:0,total:1});
  assert.equal(f.writes.length,1);
  const input=(f.writes[0] as any).args.p_input;
  assert.equal(input.action,'save');assert.equal(input.kind,'tariff');assert.equal(input.expectedRevision,0);
  assert.equal('state' in input,false);assert.equal('grossCents' in input,false);
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
