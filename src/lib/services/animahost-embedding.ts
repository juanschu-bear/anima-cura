import {join} from 'node:path';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';

export const embeddingModel='multilingual-e5-small:q8:761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const embeddingDimensions=384;
let loaded:Promise<any>|undefined;
/** Local CPU inference. Only model assets are downloaded; no patient text leaves this process. */
export async function embedRetrieval(texts:string[],kind:'query'|'passage'='passage'):Promise<number[][]>{
 if(!texts.length)return [];
 if(texts.length>32||texts.some(text=>text.length>12000))throw Error('embedding_input_invalid');
 loaded??=(async()=>{
  const {pipeline,env}=await import('@huggingface/transformers');
  const bundled=join(process.cwd(),'.model-assets');
  env.cacheDir=process.env.ANIMAHOST_EMBEDDING_CACHE??(existsSync(bundled)?bundled:join(tmpdir(),'animahost-models'));
  const cached=existsSync(join(env.cacheDir,'Xenova/multilingual-e5-small/761b726dd34fb83930e26aab4e9ac3899aa1fa78/onnx/model_quantized.onnx'));
  env.allowLocalModels=cached;
  return pipeline('feature-extraction','Xenova/multilingual-e5-small',{
   revision:'761b726dd34fb83930e26aab4e9ac3899aa1fa78',dtype:'q8',device:'cpu',
   local_files_only:cached,
  });
 })().catch(error=>{loaded=undefined;throw error;});
 const model=await loaded;
 const output=await model(texts.map(text=>`${kind}: ${text}`),{pooling:'mean',normalize:true,truncation:true,max_length:512});
 const vectors=output.tolist() as number[][];
 if(vectors.some(v=>v.length!==embeddingDimensions||v.some(n=>!Number.isFinite(n))))throw Error('embedding_invalid');
 return vectors;
}
