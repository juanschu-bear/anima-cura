// Include pinned local embeddings in the deployment. No cold request downloads a model.
import {resolve} from 'node:path';
import {mkdirSync} from 'node:fs';
process.env.ANIMAHOST_EMBEDDING_CACHE=resolve('.model-assets');
mkdirSync(process.env.ANIMAHOST_EMBEDDING_CACHE,{recursive:true});
const {embedRetrieval}=await import('../src/lib/services/animahost-embedding');
const [vector]=await embedRetrieval(['Vorbereitung der lokalen semantischen Suche.'],'query');
if(vector.length!==384)throw Error('embedding_model_invalid');
console.log('Local multilingual retrieval model prepared (384 dimensions).');
