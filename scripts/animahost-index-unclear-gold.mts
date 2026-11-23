import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const {createServerClient}=await import('../src/lib/db/supabase');
const {bundledGoldDocuments,upsertRetrievalDocuments}=await import('../src/lib/services/animahost-retrieval');
const tenant=process.env.ANIMAHOST_TENANT_ID;
if(!tenant)throw Error('tenant_not_configured');
const docs=bundledGoldDocuments().filter(d=>d.ref.startsWith('gold-unklar-'));
if(docs.length!==4)throw Error('expected_four_unclear_examples');
const db=createServerClient();
await upsertRetrievalDocuments(db,tenant,docs);
const retired=await db.from('animahost_retrieval_documents').update({active:false})
 .eq('tenant_id',tenant).eq('kind','gold').in('ref',['gold-unklar-link','gold-unklar-huhu','gold-unklar-zweite-runde']);
if(retired.error)throw Error('unclear_gold_retire_failed');
console.log({indexed:docs.length,refs:docs.map(d=>d.ref)});
