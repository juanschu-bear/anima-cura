// Enrich a PRIVATE export with remaining name spans before indexing. No WhatsApp/database writes.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const {historyPairDocuments}=await import('../src/lib/services/animahost-history-pairs');
const {remainingPersonNames}=await import('../src/lib/services/animahost-retrieval-redaction');
const [sourcePath,humanBefore,model]=process.argv.slice(2);
if(!sourcePath||!Number.isFinite(Date.parse(humanBefore))||!model)throw Error('Usage: PRIVATE_EXPORT HUMAN_BEFORE MODEL');
const path=resolve(sourcePath),inside=relative(process.cwd(),path);
if(!inside.startsWith('..')&&!isAbsolute(inside))throw Error('Private exports must stay outside Git');
const data=JSON.parse(readFileSync(path,'utf8'));
const names=data.names.flatMap((p:any)=>[p.vorname??'',p.nachname??'']);
const documents=historyPairDocuments(data.history??data.archive,names,new Set(data.automaticMessageIds??[]),humanBefore);
const found=new Set<string>(data.additionalNames??[]);
let next=0,done=0;
await Promise.all(Array.from({length:3},async()=>{
 while(next<documents.length){
  const batch=documents.slice(next,next+=24);
  for(const name of await remainingPersonNames(batch.map(d=>d.content),model))found.add(name);
  if(++done%10===0)console.log({auditedBatches:done});
 }
}));
data.additionalNames=Array.from(found);
data.nameAuditAt=new Date().toISOString();
writeFileSync(path,JSON.stringify(data),{mode:0o600});
console.log({additionalNameSpans:found.size,documents:documents.length});
