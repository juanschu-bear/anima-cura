/** Synthetic conversations only; real responses are fed into each subsequent turn. No delivery or persistence APIs. */
import {writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {createServerClient}=require('../src/lib/db/supabase.ts');
const {gatewayGenerate}=require('../src/lib/services/animahost-chain-model.ts');
const {runRetrievalReply}=require('../src/lib/services/animahost-retrieval-core.ts');
const {identityMessageForTurn,subjectNameResolution,removeInferredParentSalutation}=require('../src/lib/services/animahost-name-match.ts');
const {callbackDeadlineSentences}=require('../src/lib/services/animahost-no-deadlines.ts');
const {unsupportedActionClaims}=require('../src/lib/services/animahost-action-evidence.ts');
const [tenant,path]=process.argv.slice(2);if(!tenant||!path)throw Error('Usage: TENANT PRIVATE_OUTPUT');
const rel=relative(process.cwd(),resolve(path));if(!rel.startsWith('..')&&!isAbsolute(rel))throw Error('Output must stay outside repository');
const db=createServerClient();const {data:practice,error}=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',tenant).single();if(error)throw error;
const {data:version,error:rulesError}=await db.from('animahost_whatsapp_rulebook_versions').select('rules').eq('tenant_id',tenant).eq('version',practice.active_rulebook_version).single();if(rulesError)throw rulesError;
const patients=[{id:'synthetic-a',vorname:'Alex',nachname:'Beispiel'},{id:'synthetic-b',vorname:'Mira',nachname:'Beispiel'}];
const scenarios=[
 {id:'S01',messages:['Mein Sohn Alex Beispiel kommt zu spät zu seinem Termin.','Etwa zehn Minuten.','Danke!'],patients:['synthetic-a','synthetic-a','synthetic-a'],phases:['clarify','within','silent']},
 {id:'S02',messages:['Mein Sohn Alex Beispiel vertritt die Schule beim Wettkampf und wird vielleicht erst um 15:20 fertig. Er hat einen Termin bei Ihnen.','Wir kommen etwa 20 Minuten nach dem vereinbarten Termin.','Wir sind aber schon eine Stunde gefahren. Können wir mit den 20 Minuten Verspätung trotzdem kommen?'],patients:['synthetic-a','synthetic-a','synthetic-a'],phases:['clarify','reschedule','exception']},
 {id:'S03',messages:['Mein Sohn Alex Beispiel kommt zu spät.','Jetzt geht es um meine Tochter Mira Beispiel, sie kommt ebenfalls zu spät.','Sie wird ungefähr zehn Minuten nach dem Termin da sein.'],patients:['synthetic-a','synthetic-b','synthetic-b'],phases:['clarify','clarify','within']},
];
const output:any={source:'synthetic_consecutive_conversations',sendCount:0,startedAt:new Date().toISOString(),rows:[]};
for(const scenario of scenarios){
 const history:any[]=[];
 for(let i=0;i<scenario.messages.length;i++){
  const message=scenario.messages[i],at=new Date(Date.parse('2026-11-25T09:00:00Z')+i*120000).toISOString();
  const identity=subjectNameResolution(identityMessageForTurn(message,history,at),patients,patients.map(p=>p.id));
  const result=await runRetrievalReply(gatewayGenerate(practice.model,AbortSignal.timeout(90000),()=>{}),{message,messageType:'text',jid:'synthetic@s.whatsapp.net',phone:null,practicePhone:practice.practice_phone,history:[...history],dossier:{sender:'unknown',patients:[]},chatName:identity?.context,patientSheet:{access:identity?.context.confirmed?'confirmed':'unconfirmed',asOf:at,context:{patient:identity?.context.matchedName},fields:{}},documents:[],rules:version.rules,teamTime:'',today:'2026-11-25',receivedAt:at,doctolibUrl:practice.doctolib_url,hasPriorConversation:history.length>0,hasPriorReply:history.some(h=>h.direction==='outgoing'),identityAsked:false,preview:true,budgetMs:60000});
  const addressed=removeInferredParentSalutation(result.text,identityMessageForTurn(message,history,at),identity?.patient);
  result.text=addressed.text;
  const phase=scenario.phases[i],hasLink=/https?:\/\/\S*doctolib/.test(result.text),actualPhase=result.checks?.at(-1)?.lateness;
  const checks={identity:identity?.context.patientId===scenario.patients[i],phase:phase==='silent'?result.skipSend===true:actualPhase===phase,reply:phase==='silent'?!result.text:Boolean(result.text),link:hasLink===(phase==='reschedule'),noDeadline:!callbackDeadlineSentences(result.text).length,noInventedAction:!unsupportedActionClaims(result.text).length,team:phase==='silent'||result.teamKind===(phase==='exception'?'act':'info')};
  output.rows.push({scenario:scenario.id,turn:i+1,message,identity:identity?.context,result,checks});
  history.push({direction:'incoming',text:message,at});if(result.text)history.push({direction:'outgoing',source:'animahost',text:result.text,at:new Date(Date.parse(at)+30000).toISOString()});
  writeFileSync(path,JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify({scenario:scenario.id,turn:i+1,checks}));
 }
}
output.finishedAt=new Date().toISOString();output.failed=output.rows.filter((r:any)=>Object.values(r.checks).some(v=>!v)).length;writeFileSync(path,JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify({turns:output.rows.length,failed:output.failed,sendCount:0}));
if(output.failed)process.exitCode=1;
