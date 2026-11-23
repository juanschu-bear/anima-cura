// Read-only benchmark. Input/output contain private audit data and must stay outside Git.
// AI_GATEWAY_API_KEY must be supplied through the environment. No database writes or transport calls.
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
const local=createRequire(process.cwd()+'/package.json');
const {runChain}=local('./src/lib/services/animahost-chain.ts');
const {gatewayGenerate}=local('./src/lib/services/animahost-chain-model.ts');
const {emergencyDecision,resolveEmergency,explicitOptOut}=local('./src/lib/services/animahost-whatsapp.ts');
const {appointmentLocalDate}=local('./src/lib/services/animahost-appointment-notices.ts');
const {teamReplyTime}=local('./src/lib/services/animahost-team-time.ts');
const {recentConversation}=local('./src/lib/services/animahost-whatsapp-conversation.ts');
const {patientIsMinor,maskBirthDates}=local('./src/lib/services/animahost-chat-identity.ts');
const {t}=local('./src/lib/i18n.ts');
const [sourcePath,outputPath,mode='approved']=process.argv.slice(2);
if(!sourcePath||!outputPath||!['approved','draft_preview'].includes(mode))throw Error('Usage: node --import tsx scripts/animahost-replay-benchmark.mts PRIVATE_INPUT PRIVATE_OUTPUT [approved|draft_preview]');
const destination=resolve(outputPath);
const outputRelative=relative(process.cwd(),destination);
if(!outputRelative.startsWith('..')&&!isAbsolute(outputRelative))throw Error('Private output must be outside the repository');
const data=JSON.parse(readFileSync(sourcePath,'utf8'));
const draft=mode==='draft_preview'?local('./src/lib/services/animahost-kfo-import.ts').bundledKfoPreview():{fileVersion:'approved-baseline',entries:data.knowledge};
let done=new Set<string>();
try{done=new Set(readFileSync(destination,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line).id));}catch{}
const practice=data.practice;
const phoneFor=(row:any)=>row.phone_e164??(row.jid.endsWith('@s.whatsapp.net')?row.jid.split('@')[0]:null);
const kindFor=(row:any)=>row.jid.endsWith('@g.us')?'group':data.staffPhones.includes(phoneFor(row))?'team':
 row.labels.length||data.patients.some((p:any)=>p.phone===phoneFor(row))?'patient':'unknown';
const allLabels=(row:any)=>[...row.labels,...data.patients.filter((p:any)=>p.phone===phoneFor(row))
 .map((p:any)=>({id:p.id,firstName:p.vorname,lastName:p.nachname}))];
const lower=(s:string)=>s.toLocaleLowerCase('de-DE');
function redact(row:any,value:string|null|undefined){
 if(!value)return '';
 const names=new Set<string>();
 for(const item of allLabels(row)){
  if(item.firstName)names.add(item.firstName);
  if(item.lastName)names.add(item.lastName);
  const extra=data.clinical.find((p:any)=>p.id===item.id);
  if(extra?.vorname)names.add(extra.vorname);
  if(extra?.nachname)names.add(extra.nachname);
 }
 if(row.display_name)for(const name of row.display_name.match(/\p{L}{2,}/gu)??[])names.add(name);
 const allow=['doctolib','whatsapp','anima','cura','aligner','praxis','montag','dienstag','mittwoch','donnerstag','freitag','samstag','sonntag'];
 const known=new Set([...names].flatMap(name=>name.match(/\p{L}{2,}/gu)??[]).map(lower).filter(x=>!allow.includes(x)));
 return value.normalize('NFKC')
  .replace(/https?:\/\/[^\s<>]+/gi,url=>url.startsWith('https://www.doctolib.de/')||/^https:\/\/animacura\.io\/?$/.test(url)?url:'[Link entfernt]')
  .replace(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[E-Mail]')
  .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z\d]){12,30}\b/g,'[Kontodaten]')
  .replace(/(?:\+\d|\b0\d)[\d /().-]{6,}\d/g,'[Telefon]')
  .replace(/\b(?:\d[\s-]?){6,}\b/g,'[Nummer]')
  .replace(/((?:mein(?:e[rn]?)?|unser(?:e[rn]?)?)\s+(?:Sohn|Tochter|Kind))(?:\s+[A-ZÄÖÜ][\p{Ll}'-]+){1,2}/gu,'$1 [Patient]')
  .replace(/\b(Frau|Herrn?|Dr\.)\s+[A-ZÄÖÜ][\p{Ll}'-]+(?:[-\s]+[A-ZÄÖÜ][\p{Ll}'-]+)?/gu,'$1 [Name]')
  .replace(/((?:freundliche|viele|liebe|beste)\s+grüße|\b(?:mfg|lg|vg)\b)[,\s]*[^\n]+$/gi,'$1 [Name]')
  .replace(/\b(ich heiße|mein name ist|hier schreibt|es schreibt)\b\s+[\p{Lu}][\p{Ll}'-]+(?:\s+[\p{Lu}][\p{Ll}'-]+){0,2}/giu,'$1 [Name]')
  .replace(/\p{L}+/gu,word=>{const clean=lower(word);return known.has(clean)||(clean.endsWith('s')&&known.has(clean.slice(0,-1)))?'[Patient]':word;})
  .replace(/(geburtsdatum|geboren am|\bgeb\.?)\s*(?:[:=]\s*)?\d{1,4}[./-]\d{1,2}[./-]\d{2,4}/gi,'$1 [Datum]');
}
const voiceLanguage=(value:string)=>/\b(?:where|when|please|daughter|what|appointment|speak|thank|my)\b/i.test(value)?'en':
 /[¿¡]|\b(?:hola|cita|factura|gracias|puedo|mañana)\b/i.test(value)?'es':'de';
const quality=(text:string|null,rule:string|null)=>{
 if(!text)return 'no_reply';
 if(/(?:danke für ihre nachricht[. ].{0,70}(?:sieht sich unser praxisteam|leite .* an (?:das|unser) team)|thank you for your message.{0,50}practice team)/i.test(text))return 'handoff_only';
 if(rule?.startsWith('fallback:')&&!/https:\/\//i.test(text))return 'handoff_only';
 if(rule==='conversation:outside_scope')return 'unrated';
 return 'content';
};
const safeResponse=(row:any,reply:string)=>redact(row,reply).replace(/\[(?:Patient|Name)\](?:\s+\[(?:Patient|Name)\])+/g,'[Patient]');
const pending=data.rows.filter((row:any)=>!done.has(row.id));
let head=0,completed=0;
async function replayCase(row:any){
 const id=row.id,kind=kindFor(row),at=new Date(row.at).toISOString();
 const result={id,at,origin:row.origin,kind,priorRule:row.prior_rule,priorSource:row.prior_source,priorQuality:quality(row.prior_text,row.prior_rule),
  prompt:redact(row,row.body)||'[Nachricht ohne Text]',before:redact(row,row.prior_text)||null,rulebookVersion:practice.active_rulebook_version,knowledgeVersion:draft.fileVersion};
 if(kind!=='patient')return {...result,prompt:null,before:null,after:null,status:'sender_excluded',afterQuality:'excluded'};
 const raw=redact(row,row.body),language=voiceLanguage(raw);
 if(!raw){
  const candidate=row.message_type?.replace(/^view_once_/,'')??'unsupported';
  const kind=['image','audio','document','sticker'].includes(candidate)?candidate:['album','video'].includes(candidate)?'image':'unsupported';
  return {...result,after:t('animahost.whatsapp.media.'+kind,language),status:'fixed_media',afterQuality:'content',rule:'media:'+kind};
 }
 const emergency=emergencyDecision(raw);
 if(emergency){
  const decision=resolveEmergency(raw,emergency,practice.rules,[],language,practice.practice_phone);
  return {...result,after:decision.text,status:'fixed_emergency',afterQuality:'content',rule:decision.rule};
 }
 if(explicitOptOut(raw))return {...result,after:t('animahost.whatsapp.optOut',language),status:'fixed_opt_out',afterQuality:'content',rule:'opt_out'};
 const today=appointmentLocalDate(at);
 const linked=[...new Map(allLabels(row).map((p:any)=>[p.id,p])).values()];
 const dossierPatients=linked.map((p:any)=>{
  const extra=data.clinical.find((x:any)=>x.id===p.id);
  const verified=data.verified.some((x:any)=>x.chat_jid===row.jid&&x.patient_id===p.id&&Date.parse(x.verified_at)<=Date.parse(at))||
   Boolean(p.kind==='manual'&&p.confirmedAt&&Date.parse(p.confirmedAt)<=Date.parse(at));
  return {id:p.id,firstName:'[Patient]',lastName:'',minor:patientIsMinor(extra?.geburtsdatum??null,today),verified,
   treatment:extra?.behandlung??null,appAccount:null,openedInvoicesInApp:null,invoices:'unclear',
   ...(verified?{confidential:{newestInvoiceDate:null,lastVisits:[],reminders:[],installmentPlan:null,nextInstallmentDue:null,
    nextAppointments:data.appointments.filter((a:any)=>a.patient_id===p.id&&a.datum>=today&&Date.parse(a.created_at)<=Date.parse(at))
     .map((a:any)=>({date:a.datum,time:a.uhrzeit?.slice(0,5)??null})).slice(0,3)}}:{})};
 });
 const simulatedHistory=recentConversation(row.history.map((h:any)=>({...h,text:maskBirthDates(redact(row,h.text))})),at);
 const trace:any[]=[];
 const candidate=await runChain(gatewayGenerate(practice.model,AbortSignal.timeout(43_000),(call:any)=>trace.push(call)),{
  message:maskBirthDates(raw),language,informal:false,history:simulatedHistory,
  dossier:{sender:dossierPatients.length===1&&dossierPatients[0].minor===false?'patient':'guardian',patients:dossierPatients},
  rules:practice.rules,approvedKnowledge:draft.entries,knowledgeMode:mode,practice:{doctolibUrl:practice.doctolib_url,
   phone:practice.practice_phone,teamTime:teamReplyTime(at,practice.team_reply_days,practice.closure_periods,language),today,
   closurePeriods:practice.closure_periods},baseline:null,budgetMs:42_000});
 if(!candidate.ok)return {...result,after:null,status:candidate.reason,violations:candidate.violations,ms:candidate.ms,
  trace,modelFailures:trace.map((x:any)=>x.failure).filter(Boolean),afterQuality:'withheld'};
 return {...result,after:safeResponse(row,candidate.text),status:'simulated',afterQuality:candidate.concerns.some((x:any)=>['regel','akte','gespraech'].includes(x.way))?'content':'handoff_only',
  rule:candidate.rule,usedRuleIds:candidate.usedRuleIds,usedKnowledge:candidate.usedKnowledge.map(({id,version}:any)=>({id,version})),
  trace,confirmed:dossierPatients.filter((x:any)=>x.verified).length,ms:candidate.ms};
}
await Promise.all(Array.from({length:6},async()=>{while(head<pending.length){const row=pending[head++];
 try{const result=await replayCase(row);appendFileSync(destination,JSON.stringify(result)+'\n',{mode:0o600});}
 catch(error){appendFileSync(destination,JSON.stringify({id:row.id,kind:kindFor(row),origin:row.origin,status:'execution_failed',afterQuality:'withheld',error:error instanceof Error?error.name:'unknown'})+'\n',{mode:0o600});}
 if(++completed%10===0||completed===pending.length)console.log(completed+'/'+pending.length);
}}));
