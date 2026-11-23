// Private input/output only. Reads the real retrieval index; never writes a decision, case or transport message.
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json');
require('@next/env').loadEnvConfig(process.cwd());
const {createServerClient}=require('./src/lib/db/supabase.ts');
const {retrieveSources,contentHash}=require('./src/lib/services/animahost-retrieval.ts');
const {retrievalPreflight,runRetrievalReply}=require('./src/lib/services/animahost-retrieval-core.ts');
const {gatewayGenerate}=require('./src/lib/services/animahost-chain-model.ts');
const {anonymizeRetrieval}=require('./src/lib/services/animahost-retrieval-privacy.ts');
const {patientIsMinor,maskBirthDates}=require('./src/lib/services/animahost-chat-identity.ts');
const {teamReplyTime}=require('./src/lib/services/animahost-team-time.ts');
const {appointmentLocalDate}=require('./src/lib/services/animahost-appointment-notices.ts');
const {recentConversation}=require('./src/lib/services/animahost-whatsapp-conversation.ts');
const [sourcePath,outputPath,mode='approved',limitArg]=process.argv.slice(2);
if(!sourcePath||!outputPath||!['approved','draft_preview'].includes(mode))throw Error('Usage: PRIVATE_INPUT PRIVATE_OUTPUT approved|draft_preview [LIMIT]');
const destination=resolve(outputPath),path=relative(process.cwd(),destination);
if(!path.startsWith('..')&&!isAbsolute(path))throw Error('Private output must stay outside Git');
const data=JSON.parse(readFileSync(sourcePath,'utf8')),db=createServerClient(),practice=data.practice;
const done=new Set<string>();
try{for(const l of readFileSync(destination,'utf8').trim().split('\n').filter(Boolean))done.add(JSON.parse(l).id);}catch{}
const pending=data.rows.filter((r:any)=>!done.has(r.id)).slice(0,limitArg?Number(limitArg):undefined);
const aliases=new Map<string,string>();
for(const patient of data.clinical??[])if(!aliases.has(patient.id))aliases.set(patient.id,'Patient'+String.fromCharCode(65+aliases.size%26));
function sanitize(row:any,text:string|null){
 const names=[...(data.names??[]).flatMap((p:any)=>[p.vorname??'',p.nachname??'']),...(data.archive??[]).map((h:any)=>h.display_name??''),...(data.clinical??[]).flatMap((p:any)=>[p.vorname??'',p.nachname??'']),row.display_name??'',...row.labels.flatMap((p:any)=>[p.firstName??'',p.lastName??''])];
 return maskBirthDates(anonymizeRetrieval(text??'',names));
}
let next=0,completed=0;
async function evaluate(row:any){
 const started=Date.now(),at=new Date(row.at).toISOString(),today=appointmentLocalDate(at);
 const phone=row.phone_e164??(row.jid.endsWith('@s.whatsapp.net')?row.jid.split('@')[0]:null);
 const linked=[...new Map([...row.labels,...data.patients.filter((p:any)=>p.phone===phone).map((p:any)=>({id:p.id,firstName:p.vorname,lastName:p.nachname}))].map((p:any)=>[p.id,p])).values()] as any[];
 const patients=linked.map((p:any)=>{const extra=data.clinical.find((x:any)=>x.id===p.id);const verified=data.verified.some((x:any)=>x.chat_jid===row.jid&&x.patient_id===p.id&&Date.parse(x.verified_at)<=Date.parse(at));return {
  id:p.id,firstName:'[Patient]',lastName:'',minor:patientIsMinor(extra?.geburtsdatum??null,today),verified,treatment:null,appAccount:null,openedInvoicesInApp:null,invoices:'unclear',
  ...(verified?{confidential:{newestInvoiceDate:null,lastVisits:[],reminders:[],installmentPlan:null,nextInstallmentDue:null,nextAppointments:[]}}:{})};});
 const history=recentConversation(row.history.map((h:any)=>({...h,text:sanitize(row,h.text)})),at);
 const base={message:sanitize(row,row.body),messageType:row.message_type??'text',jid:row.jid,phone,practicePhone:practice.practice_phone,teamPhones:data.staffPhones.join(','),
  history,dossier:{sender:patients.length===1&&patients[0].minor===false?'patient':'guardian',patients},documents:[],rules:practice.rules,
  teamTime:teamReplyTime(at,practice.team_reply_days,practice.closure_periods,'de'),today,doctolibUrl:practice.doctolib_url,
  hasPriorConversation:row.history.length>0,hasPriorReply:row.history.some((h:any)=>h.direction==='outgoing'),identityAsked:row.history.some((h:any)=>h.direction==='outgoing'&&/welchen Patienten|um wen|Vor- und Nachnamen|Geburtsdatum/i.test(h.text)),preview:mode==='draft_preview',budgetMs:17000};
 const preflight=retrievalPreflight(base);
 let result=preflight,timings:any={embeddingMs:0,searchMs:0},calls:any[]=[];
 if(!preflight){
  // Leave this entire chat out: no retrospective retrieval of its answer or its later continuation.
  const found=await retrieveSources(db,practice.tenant_id,base.message,history.filter((h:any)=>h.direction==='incoming').map((h:any)=>h.text),base.preview,contentHash(row.jid));
  timings=found.timings;
  result=await runRetrievalReply(gatewayGenerate(practice.model,AbortSignal.timeout(18000),(c:any)=>calls.push(c)),{...base,documents:found.documents,budgetMs:Math.max(1000,17000-(Date.now()-started))});
 }
 return {id:row.id,origin:row.origin,mode,prompt:base.message,before:sanitize(row,row.prior_text),after:sanitize(row,result.text),...result,
  text:sanitize(row,result.text),teamSummary:sanitize(row,result.teamSummary),calls,timings:{...timings,modelMs:result.ms,totalMs:Date.now()-started},whatsappSent:0,productionWrites:0};
}
await Promise.all(Array.from({length:Math.max(1,Math.min(6,Number(process.env.REPLAY_CONCURRENCY??2)))},async()=>{while(next<pending.length){const row=pending[next++];try{appendFileSync(destination,JSON.stringify(await evaluate(row))+'\n',{mode:0o600});}
 catch(e){appendFileSync(destination,JSON.stringify({id:row.id,origin:row.origin,mode,error:e instanceof Error?e.message:'unknown',substantive:false,excluded:false})+'\n',{mode:0o600});}
 if(++completed%20===0||completed===pending.length)console.log(completed+'/'+pending.length);
}}));
