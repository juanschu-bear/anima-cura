import {unclearInput} from './animahost-unclear-input';
import {createHash} from 'node:crypto';
import type {createServerClient} from '@/lib/db/supabase';
import gold from '../../../docs/animahost/goldbeispiele-v1.json';
import {embedRetrieval,embeddingModel} from './animahost-embedding';
import {renderWhatsAppRuleText,type WhatsAppRule} from './animahost-whatsapp';

type Db=ReturnType<typeof createServerClient>;
export type RetrievalKind='gold'|'knowledge'|'rule'|'history';
export type RetrievalDocument={kind:RetrievalKind;ref:string;version:number;source_at:string;title:string;content:string;
 payload:Record<string,unknown>;draft:boolean;content_hash:string;embedding?:number[]|null;embedding_model?:string|null;active?:boolean;origin_ref?:Record<string,unknown>};
export type RetrievalEvidence={kind:RetrievalKind;ref:string;version:number;date:string;preview:boolean};
export const evidence=(d:RetrievalDocument):RetrievalEvidence=>({kind:d.kind,ref:d.ref,version:d.version,date:d.source_at,preview:d.draft});
export const contentHash=(text:string)=>createHash('sha256').update(text).digest('hex');
export function bundledGoldDocuments():RetrievalDocument[]{
 return gold.beispiele.map(entry=>{const payload={question:entry.anliegen,context:entry.kontext,answer:entry.antwort,knowledge:entry.wissen,area:'area' in entry?entry.area:null,topic:'topic' in entry?entry.topic:null};
 const content=[entry.anliegen,entry.kontext,entry.antwort??''].join('\n');
 return {kind:'gold',ref:entry.id,version:1,source_at:('stand' in entry?String(entry.stand):gold.stand)+'T00:00:00Z',title:entry.id,content,payload,draft:false,content_hash:contentHash(content)};});
}
export async function upsertRetrievalDocuments(db:Db,tenant:string,documents:RetrievalDocument[]){
 for(let start=0;start<documents.length;start+=32){
  const batch=documents.slice(start,start+32);
  const old=await db.from('animahost_retrieval_documents').select('kind,ref,version,content_hash,embedding_model,draft,active,source_at').eq('tenant_id',tenant).in('ref',batch.map(d=>d.ref));
  if(old.error)throw Error('retrieval_index_unavailable');
  const changed=batch.filter(d=>!old.data.some(row=>row.kind===d.kind&&row.ref===d.ref&&row.version===d.version&&row.content_hash===d.content_hash&&row.embedding_model===embeddingModel&&row.draft===d.draft&&row.active===(d.active??true)&&Date.parse(row.source_at)===Date.parse(d.source_at)));
  if(!changed.length)continue;
  const vectors:number[][]=[];
  for(let offset=0;offset<changed.length;offset+=8)vectors.push(...await embedRetrieval(changed.slice(offset,offset+8).map(d=>d.content)));
  const result=await db.from('animahost_retrieval_documents').upsert(changed.map((d,i)=>({kind:d.kind,ref:d.ref,version:d.version,source_at:d.source_at,title:d.title,content:d.content,payload:d.payload,draft:d.draft,content_hash:d.content_hash,active:d.active??true,origin_ref:d.origin_ref??{},tenant_id:tenant,embedding:vectors[i],embedding_model:embeddingModel,indexed_at:new Date().toISOString()})),{onConflict:'tenant_id,kind,ref,version'});
  if(result.error)throw Error('retrieval_index_write_failed:'+result.error.code+':'+result.error.message);
 }
}
export async function syncRetrievalSources(db:Db,tenant:string){
 const [settings,knowledge]=await Promise.all([
  db.from('animahost_whatsapp_settings').select('active_rulebook_version,doctolib_url').eq('tenant_id',tenant).single(),
  db.from('animahost_knowledge_versions').select('*').eq('tenant_id',tenant).order('version',{ascending:false}).limit(5000),
 ]);
 if(settings.error||knowledge.error)throw Error('retrieval_sources_unavailable');
 const version=await db.from('animahost_whatsapp_rulebook_versions').select('rules,created_at').eq('tenant_id',tenant).eq('version',settings.data.active_rulebook_version).single();
 if(version.error)throw Error('retrieval_rules_unavailable');
 const docs:RetrievalDocument[]=bundledGoldDocuments();
 for(const row of knowledge.data){
  const payload={content:row.content,guidance:row.metadata?.guidance??{},sources:row.metadata?.sources??[],externalId:row.external_id};
  const content=[row.title,row.content,...Object.values(row.metadata?.guidance??{})].join('\n');
  docs.push({kind:'knowledge',ref:row.id,version:row.version,source_at:row.approved_at??row.created_at,title:row.title,content,payload,draft:!row.approved_at,active:row.approved_at?row.active:true,content_hash:contentHash(content)});
 }
 for(const rule of version.data.rules as WhatsAppRule[]){
  const content=renderWhatsAppRuleText(rule.patientText,settings.data.doctolib_url);if(!content)continue;
  docs.push({kind:'rule',ref:rule.id,version:settings.data.active_rulebook_version,source_at:version.data.created_at,title:rule.topic,content,payload:{fact:content},draft:false,content_hash:contentHash(content)});
 }
 await upsertRetrievalDocuments(db,tenant,docs);
 // Durable pending Gold rows survive embedding/provider failures and are retried by the scheduled sync.
 const pending=await db.from('animahost_retrieval_documents').select('*').eq('tenant_id',tenant).eq('kind','gold').eq('active',true).is('embedding',null).limit(100);
 if(pending.error)throw Error('retrieval_gold_unavailable');
 await upsertRetrievalDocuments(db,tenant,pending.data);
 return {sources:docs.length,goldPendingProcessed:pending.data.length};
}
export async function retrieveSources(db:Db,tenant:string,message:string,patientHistory:string[],preview=false,excludeChat?:string){
 const start=Date.now();
 const query=[...patientHistory.slice(-3),message].join('\n').slice(-6000);
 const [vector]=await embedRetrieval([query],'query');
 const embedded=Date.now();
 const result=await db.rpc('animahost_retrieval_match',{p_tenant:tenant,p_vector:JSON.stringify(vector),p_model:embeddingModel,p_preview:preview,p_day:new Date().toISOString().slice(0,10),p_exclude_chat:excludeChat??null})
  .select('kind,ref,version,source_at,title,content,payload,draft,content_hash').abortSignal(AbortSignal.timeout(4000));
 if(result.error)throw Error('retrieval_search_unavailable:'+result.error.code+':'+result.error.message);
 // Explicit companion fact for apparatus problems, not a routing/fallback topic.
 let companion:RetrievalDocument|null=null;
 if(/draht|spange|schiene|aligner|bracket|attachment|apparatur/i.test(message)){
  const versions=await db.from('animahost_knowledge_versions').select('id,version,approved_at,active,valid_from').eq('tenant_id',tenant).eq('external_id','ablauf-spontan').lte('valid_from',new Date().toISOString().slice(0,10)).order('version',{ascending:false});
  if(versions.error)throw Error('retrieval_companion_unavailable');
  const row=versions.data.find(r=>r.approved_at&&r.active||preview&&!r.approved_at);
  if(row){const doc=await db.from('animahost_retrieval_documents').select('kind,ref,version,source_at,title,content,payload,draft,content_hash').eq('tenant_id',tenant).eq('kind','knowledge').eq('ref',row.id).eq('version',row.version).maybeSingle();
   if(doc.error)throw Error('retrieval_companion_unavailable');companion=doc.data as RetrievalDocument|null;}
 }
 // Never send vectors, origin identifiers or raw archive identifiers to the language model/client.
 const documents=(result.data as RetrievalDocument[]).map(({kind,ref,version,source_at,title,content,payload,draft,content_hash})=>({kind,ref,version,source_at,title,content,payload,draft,content_hash}));
 if(unclearInput(message,'text')||!message.trim()){
  const examples=await db.from('animahost_retrieval_documents').select('kind,ref,version,source_at,title,content,payload,draft,content_hash').eq('tenant_id',tenant).eq('kind','gold').eq('active',true).in('ref',['gold-unklar-link-du','gold-unklar-link-sie','gold-unklar-huhu-du','gold-unklar-zweite-runde-du']);
  if(examples.error)throw Error('retrieval_gold_unavailable');
  for(const doc of examples.data as RetrievalDocument[]){const i=documents.findIndex(d=>d.kind==='gold'&&d.ref===doc.ref);if(i>=0)documents.splice(i,1);documents.unshift(doc);}
 }
 if(companion){const index=documents.findIndex(d=>d.kind==='knowledge'&&d.ref===companion!.ref);if(index>=0)documents.splice(index,1);documents.unshift(companion);}
 return {documents,timings:{embeddingMs:embedded-start,searchMs:Date.now()-embedded}};
}
