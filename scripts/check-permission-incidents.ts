// Read-only evidence collector. It never grants privileges, runs workers or replays patient requests.
import {createClient} from '@supabase/supabase-js';
import {loadEnvConfig} from '@next/env';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const arg=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
async function main(){
 const since=arg('since'),until=arg('until')||new Date().toISOString(),output=arg('output');
 if(!since||!Number.isFinite(Date.parse(since))||!Number.isFinite(Date.parse(until))||Date.parse(since)>Date.parse(until))throw Error('Valid --since and --until required');
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Database service environment missing');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const sources=[
  {table:'animasign_sync_log',time:'created_at',errors:['error_text']},
  {table:'integration_outbox_jobs',time:'updated_at',errors:['last_error']},
  {table:'anamnese_submissions',time:'updated_at',errors:['ivoris_sync_error','ivoris_patient_error','ivoris_document_error']},
  {table:'doku_eintraege',time:'updated_at',errors:['ivoris_fehler']},
  {table:'alerts',time:'created_at',errors:['beschreibung']},
 ];
 const collected=[];
 for(const source of sources){
  try{
   const count=async()=>{const r=await db.from(source.table).select('id',{count:'exact',head:true}).gte(source.time,since).lte(source.time,until);if(r.error||r.count===null)throw Error(r.error?.code||'missing_count');return r.count;};
   const before=await count();if(before>20000)throw Error('Window too large; split before advancing cursor');
   const rows:Array<Record<string,unknown>>=[];
   for(let offset=0;offset<before;offset+=500){
    const r=await db.from(source.table).select(['id',source.time,...source.errors].join(',')).gte(source.time,since).lte(source.time,until).order(source.time).order('id').range(offset,offset+499);
    if(r.error)throw Error(r.error.code);rows.push(...(r.data||[]) as unknown as Array<Record<string,unknown>>);
   }
   if(await count()!==before||rows.length!==before||new Set(rows.map(r=>r.id)).size!==before)throw Error('Window changed or results truncated; do not advance cursor');
   const incidents=rows.flatMap(row=>source.errors.flatMap(field=>{
    const message=String(row[field]??'');
    if(!/permission denied|\b42501\b|execute.{0,40}(denied|privilege)|fehlend.{0,20}execute/i.test(message))return [];
    return [{id:row.id,at:row[source.time],field,functionName:message.match(/permission denied for function\s+([\w.]+)/i)?.[1]??null,sqlstate:/\b42501\b/.test(message)?'42501':null,callerRole:null}];
   }));
   collected.push({source:source.table,complete:true,rows:before,incidents});
  }catch(error){collected.push({source:source.table,complete:false,error:error instanceof Error?error.message:String(error),incidents:[]});}
 }
 const report={since,until,collected,completeStoredSourceCoverage:collected.every(s=>s.complete),completeLogCoverage:false,
  note:'Stored sources only. Database/PostgREST, deployment and worker logs must be checked separately. A callerRole must be proven before restoring one exact grant. No raw clinical messages or patient names are emitted.'};
 if(output){const target=path.resolve(output);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(report,null,2)+'\n',{mode:0o600});}
 console.log(JSON.stringify(report,null,2));
 if(!report.completeStoredSourceCoverage)process.exitCode=2;else if(collected.some(s=>s.incidents.length))process.exitCode=1;
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=2;});
