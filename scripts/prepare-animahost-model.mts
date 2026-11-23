// Bundle the pinned model files so the first request can embed messages offline.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,mkdirSync,renameSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';

const model='Xenova/multilingual-e5-small';
const revision='761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const assets={
 'config.json':'cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1',
 'tokenizer_config.json':'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b',
 'tokenizer.json':'0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39',
 'onnx/model_quantized.onnx':'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193',
};
async function checksum(path:string){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return hash.digest('hex');
}

const cache=resolve('.model-assets');
process.env.ANIMAHOST_EMBEDDING_CACHE=cache;
for(const [asset,expected] of Object.entries(assets)){
 const path=join(cache,model,revision,asset);
 if(existsSync(path)&&await checksum(path)===expected)continue;
 mkdirSync(dirname(path),{recursive:true});
 const temporary=path+'.'+process.pid+'.download';
 try{
  const source=new URL('https://huggingface.co/'+model+'/resolve/'+revision+'/'+asset);
  source.searchParams.set('download','true');
  execFileSync('curl',['--fail','--silent','--show-error','--location','--retry','3','--connect-timeout','15',
   '--max-time','180','--output',temporary,source.href],{stdio:'inherit'});
  if(await checksum(temporary)!==expected)throw Error('retrieval_asset_checksum:'+asset);
  renameSync(temporary,path);
 }finally{
  rmSync(temporary,{force:true});
 }
}
const {embedRetrieval}=await import('../src/lib/services/animahost-embedding');
const [vector]=await embedRetrieval(['Vorbereitung der lokalen semantischen Suche.'],'query');
if(vector.length!==384)throw Error('embedding_model_invalid');
console.log('Local multilingual retrieval model prepared (384 dimensions).');
