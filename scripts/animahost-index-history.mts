// Read a private archive export, redact it locally, index only pre-AnimaHost human reply pairs.
// Run from the repo root with the normal server environment. Never put the export in Git.
import {readFileSync} from 'node:fs';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const {createServerClient}=await import('../src/lib/db/supabase');
const {historyPairDocuments}=await import('../src/lib/services/animahost-history-pairs');
const {syncRetrievalSources,upsertRetrievalDocuments}=await import('../src/lib/services/animahost-retrieval');
const [sourcePath,tenant,humanBefore]=process.argv.slice(2);
if(!sourcePath||!tenant||!Number.isFinite(Date.parse(humanBefore)))throw Error('Usage: PRIVATE_EXPORT TENANT HUMAN_BEFORE');
const data=JSON.parse(readFileSync(sourcePath,'utf8'));
const names=[...data.names.flatMap((p:any)=>[p.vorname??'',p.nachname??'']),...(data.additionalNames??[])];
const source=data.archive??data.history;
if(!Array.isArray(data.staffPhones))throw Error('Configured staffPhones must be included in the private export');
if(!data.chatPhones)throw Error('LID phone mappings must be included in the private export');
const staff=new Set([...data.staffPhones,...(data.nonPatientPhones??[]),data.practicePhone].filter(Boolean).map((p:string)=>p.replace(/\D/g,'')));
const filtered=source.filter((m:any)=>!staff.has(data.chatPhones[m.chat_jid]??(m.chat_jid.endsWith('@s.whatsapp.net')?m.chat_jid.split('@')[0]:''))&&!m.chat_jid.endsWith('@g.us'));
const documents=historyPairDocuments(filtered,names,new Set(data.automaticMessageIds??[]),humanBefore);
const db=createServerClient();
console.log(await syncRetrievalSources(db,tenant));
for(let i=0;i<documents.length;i+=24){await upsertRetrievalDocuments(db,tenant,documents.slice(i,i+24));if(i%240===0)console.log({indexed:i+Math.min(24,documents.length-i),total:documents.length});}
const eligible=new Set(documents.map(d=>d.ref));
const stale:string[]=[];
for(let offset=0;;offset+=1000){
 const page=await db.from('animahost_retrieval_documents').select('ref').eq('tenant_id',tenant).eq('kind','history').order('ref').range(offset,offset+999);
 if(page.error)throw Error('history_reconcile_failed');
 stale.push(...page.data.filter(row=>!eligible.has(row.ref)).map(row=>row.ref));
 if(page.data.length<1000)break;
}
for(let start=0;start<stale.length;start+=100){
 const changed=await db.from('animahost_retrieval_documents').update({active:false}).eq('tenant_id',tenant).eq('kind','history').in('ref',stale.slice(start,start+100));
 if(changed.error)throw Error('history_reconcile_failed');
}
console.log({deactivated:stale.length,indexedHistoryPairs:documents.length,archiveMessages:source.length,chats:new Set(source.map((m:any)=>m.chat_jid)).size});
