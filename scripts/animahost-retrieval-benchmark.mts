// Read-only production retrieval and frozen cases. Private inputs and intermediate outputs stay outside Git.
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
const require=createRequire(process.cwd()+'/package.json');
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {createServerClient}=require('./src/lib/db/supabase.ts');
const {retrieveSources,contentHash}=require('./src/lib/services/animahost-retrieval.ts');
const {retrievalPreflight,runRetrievalReply}=require('./src/lib/services/animahost-retrieval-core.ts');
const {whatsappRulesSchema}=require('./src/lib/services/animahost-whatsapp.ts');
const {gatewayGenerate}=require('./src/lib/services/animahost-chain-model.ts');
const {classifyModelFailure}=require('./src/lib/services/animahost-model-failure.ts');
const {replyRegister}=require('./src/lib/services/animahost-reply-voice.ts');
const {anonymizeRetrieval}=require('./src/lib/services/animahost-retrieval-privacy.ts');
const {patientIsMinor,maskBirthDates}=require('./src/lib/services/animahost-chat-identity.ts');
const {teamReplyTime}=require('./src/lib/services/animahost-team-time.ts');
const {appointmentLocalDate}=require('./src/lib/services/animahost-appointment-notices.ts');
const {recentConversation}=require('./src/lib/services/animahost-whatsapp-conversation.ts');
const {clarificationRound}=require('./src/lib/services/animahost-unclear-input.ts');

const [sourcePath,outputPath,mode='approved',limitArg]=process.argv.slice(2);
if(!sourcePath||!outputPath||!['approved','draft_preview'].includes(mode))throw Error('Usage: PRIVATE_INPUT PRIVATE_OUTPUT approved|draft_preview [LIMIT]');
if(!process.env.AI_GATEWAY_API_KEY)throw Error('acceptance_key_missing');
const destination=resolve(outputPath),path=relative(process.cwd(),destination);
if(!path.startsWith('..')&&!isAbsolute(path))throw Error('Private output must stay outside Git');
const data=JSON.parse(readFileSync(sourcePath,'utf8')),db=createServerClient();
const tenant=data.practice.tenant_id;
const settings=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).single();
if(settings.error||settings.data.active_rulebook_version!==9)throw Error('expected_active_rulebook_9');
const practice=settings.data;
const rulebook=await db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',tenant).eq('version',9).single();
if(rulebook.error)throw Error('rulebook_unavailable');
const rules=whatsappRulesSchema.parse(rulebook.data.rules);
const previous=new Map<string,any>();
try{
 for(const line of readFileSync(destination,'utf8').trim().split('\n').filter(Boolean)){
  const row=JSON.parse(line);
  if(row.mode!==mode)throw Error('acceptance_output_mode_mismatch');
  previous.set(row.id,row);
 }
}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const pending=data.rows.filter((r:any)=>!previous.has(r.id)||previous.get(r.id).status==='technical_error')
 .slice(0,limitArg?Number(limitArg):undefined);
const commonNames=[...(data.additionalNames??[]),...(data.names??[]).flatMap((p:any)=>[p.vorname??'',p.nachname??'']),
 ...(data.archive??[]).map((h:any)=>h.display_name??''),...(data.clinical??[]).flatMap((p:any)=>[p.vorname??'',p.nachname??''])];
function sanitize(row:any,text:string|null){
 const names=[...commonNames,row.display_name??'',...row.labels.flatMap((p:any)=>[p.firstName??'',p.lastName??''])];
 return maskBirthDates(anonymizeRetrieval(text??'',names));
}
const empty=()=>({gold:[],knowledge:[],rule:[],history:[]});
let next=0,completed=0,blocked=false;
async function evaluate(row:any){
 const started=Date.now(),at=new Date(row.at).toISOString(),today=appointmentLocalDate(at);
 const phone=row.phone_e164??(row.jid.endsWith('@s.whatsapp.net')?row.jid.split('@')[0]:null);
 const linked=[...new Map([...row.labels,...data.patients.filter((p:any)=>p.phone===phone).map((p:any)=>({id:p.id,firstName:p.vorname,lastName:p.nachname}))].map((p:any)=>[p.id,p])).values()] as any[];
 const patients=linked.map((p:any)=>{const extra=data.clinical.find((x:any)=>x.id===p.id);const verified=data.verified.some((x:any)=>x.chat_jid===row.jid&&x.patient_id===p.id&&Date.parse(x.verified_at)<=Date.parse(at));return {
  id:p.id,firstName:p.firstName??'',lastName:p.lastName??'',minor:patientIsMinor(extra?.geburtsdatum??null,today),verified,treatment:verified?extra?.behandlung??null:null,appAccount:null,openedInvoicesInApp:null,invoices:'unclear',
  ...(verified?{confidential:{newestInvoiceDate:null,lastVisits:[],reminders:[],installmentPlan:null,nextInstallmentDue:null,nextAppointments:[]}}:{})};});
 const history=recentConversation(row.history.map((h:any)=>({...h,text:maskBirthDates(h.text??'')})),at);
 const priorReply=row.history.some((h:any)=>h.direction==='outgoing');
 const role=patients.length===1&&patients[0].verified&&patients[0].minor===false?'Patient':undefined;
 const base={message:maskBirthDates(row.body??''),messageType:row.message_type??'text',jid:row.jid,phone,practicePhone:practice.practice_phone,teamPhones:data.staffPhones.join(','),
  history,dossier:{sender:role?'patient':'unknown',patients},documents:[],rules,receivedAt:at,
  ...(role?{patientSheet:{access:'confirmed',asOf:at,fields:{schreibendePerson:'filled'},context:{schreibendePerson:{rolle:role}}}}:{}),
  teamTime:teamReplyTime(at,practice.team_reply_days,practice.closure_periods,'de'),today,doctolibUrl:practice.doctolib_url,
  hasPriorConversation:row.history.length>0,hasPriorReply:priorReply,
  identityAsked:row.history.some((h:any)=>h.direction==='outgoing'&&/welchen Patienten|um wen|Vor- und Nachnamen|Geburtsdatum|welchem Namen/i.test(h.text)),
  preview:mode==='draft_preview',budgetMs:60_000};
 const anrede=replyRegister(base.message,role,priorReply,history.filter((h:any)=>h.direction==='incoming').map((h:any)=>h.text));
 const seed={id:row.id,origin:row.origin,mode,at,input:sanitize(row,base.message),anrede,retrieved:empty(),answer:'',clarificationStage:null,
  sendDelaySeconds:null,sendStatus:'not_sent_dry_run'};
 try{
  // Read decisions as of the historical input. Only actually delivered clarification
  // text in the frozen history advances the stage.
  const preflight=retrievalPreflight(base);
  const prior=preflight?null:await db.from('animahost_whatsapp_decisions').select('rule_id,patient_text')
   .eq('tenant_id',tenant).eq('sender_jid',row.jid).lte('created_at',at).order('created_at',{ascending:false}).limit(100);
  if(prior?.error)throw Error('retrieval_context_failed');
  // Exclude the source chat from similar historical cases to avoid grading the original answer as a prediction.
  const found=preflight?{documents:[]}:await retrieveSources(db,tenant,base.message,history.filter((h:any)=>h.direction==='incoming').map((h:any)=>h.text),base.preview,contentHash(row.jid));
  const recovery:any[]=[],calls:any[]=[];
  const model=gatewayGenerate(practice.model,AbortSignal.timeout(65_000),(call:any)=>calls.push(call));
  const result=await runRetrievalReply(async(call:any)=>{
   for(let attempt=0;;attempt++){
    try{return await model(call);}
    catch(error){
     const failure=classifyModelFailure(error,call.stage??'compose');
     if(failure.httpStatus===402)blocked=true;
     if(attempt>=2||failure.httpStatus===402||Date.now()-started>40_000)throw error;
     const transient=failure.httpStatus===429||failure.code==='model_timeout'||failure.code==='model_invalid_json'||(failure.httpStatus??0)>=500;
     if(!transient)throw error;
     recovery.push(failure);
     await delay(800*(attempt+1));
    }
   }
  },{...base,clarificationRound:clarificationRound(prior?.data??[],row.history),documents:found.documents,
   budgetMs:Math.max(1000,60_000-(Date.now()-started))});
  const {text:reply,teamSummary:ignored,error,clarificationStage:stage,...rest}=result;
  return {...seed,...rest,answer:sanitize(row,reply),anrede:result.anrede??anrede,clarificationStage:stage??null,
   status:error?'technical_error':result.rule,error:error??null,recoveredErrors:recovery,
   timing:{generationMs:result.ms,totalMs:Date.now()-started},calls};
 }catch{
  return {...seed,status:'technical_error',error:{code:'retrieval_context_failed'},recoveredErrors:[],timing:{generationMs:null,totalMs:Date.now()-started}};
 }
}
const concurrency=Math.max(1,Math.min(6,Number(process.env.REPLAY_CONCURRENCY??3)));
await Promise.all(Array.from({length:concurrency},async()=>{while(next<pending.length&&!blocked){
 const row=pending[next++];
 const result=await evaluate(row);
 const earlier=previous.get(row.id);
 const priorErrors=earlier?[...(earlier.priorErrors??[]),...(earlier.recoveredErrors??[]),...(earlier.error?[earlier.error]:[])]:[];
 appendFileSync(destination,JSON.stringify({...result,priorErrors})+'\n',{mode:0o600});
 if(++completed%20===0||completed===pending.length)console.log(completed+'/'+pending.length);
}}));
if(blocked){console.error('Provider reported HTTP 402. Unexecuted cases remain pending.');process.exitCode=2;}
