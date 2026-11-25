/** No transport or decision persistence: historical read-only replay of 20 frozen chats. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const {createServerClient}=require('../src/lib/db/supabase.ts');
const {retrievalAnswer}=require('../src/lib/services/animahost-retrieval-live.ts');
const [inputPath,outputPath]=process.argv.slice(2);
const retryGuard=process.argv.includes('--retry-guard');
if(!inputPath||!outputPath)throw Error('Usage: PRIVATE_INPUT PRIVATE_OUTPUT');
for(const path of [inputPath,outputPath]){const rel=relative(process.cwd(),resolve(path));if(!rel.startsWith('..')&&!isAbsolute(rel))throw Error('Patient data must stay outside Git');}
const raw=readFileSync(inputPath,'utf8'),fixture=JSON.parse(raw);
if(new Set(fixture.rows.map((r:any)=>r.input.from)).size!==20)throw Error('Exactly 20 real chats required');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const sourceHash=hash(['src/lib/services/animahost-retrieval-core.ts','docs/animahost/2026-11-24-systemtext-v1.md'].map(p=>readFileSync(p,'utf8')).join('\n'));
const output=existsSync(outputPath)?JSON.parse(readFileSync(outputPath,'utf8')):{inputHash:hash(raw),sourceHash,startedAt:new Date().toISOString(),sendCount:0,rows:[]};
if(output.inputHash!==hash(raw)||output.sourceHash!==sourceHash)throw Error('Replay source/input changed; use a new output file');
const db=createServerClient();
const settings=await db.from('animahost_whatsapp_settings').select('*').eq('tenant_id',fixture.tenant).single();
if(settings.error)throw Error('Settings unavailable');
let cursor=0;
async function worker(){while(cursor<fixture.rows.length){const row=fixture.rows[cursor++];if(output.rows.some((r:any)=>r.case===row.case&&!r.error&&(!retryGuard||r.answer?.result?.rule!=='chain:guard_rejected')))continue;
if(output.rows.some((r:any)=>r.case===row.case)){output.rechecks??=[];output.rechecks.push({case:row.case,at:new Date().toISOString(),reason:'targeted_guard_regression'});}
let answer:any,error:string|undefined;
try{answer=await retrievalAnswer(db,{...row.input,readOnly:true},settings.data,AbortSignal.timeout(90000));}catch(e){error=e instanceof Error?e.message:'replay_failed';}
output.rows=output.rows.filter((r:any)=>r.case!==row.case);output.rows.push({case:row.case,answer,error});output.updatedAt=new Date().toISOString();writeFileSync(outputPath,JSON.stringify(output,null,2),{mode:0o600});console.log(JSON.stringify({case:row.case,error,action:answer?.result?.action,skip:answer?.result?.skipSend,checks:answer?.result?.checks?.length}));}}
await Promise.all([worker(),worker()]);
console.log(JSON.stringify({chats:20,turns:output.rows.length,errors:output.rows.filter((r:any)=>r.error).length,sendCount:0}));
