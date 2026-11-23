import {createHash} from 'node:crypto';
import {z} from 'zod';
import file from '../../../docs/animahost/wissensbasis-kfo-v1.json';
import {knowledgeAreas,knowledgeDraft,knowledgeReference,knowledgeSource,type ApprovedKnowledge} from './animahost-knowledge';

const identifier=z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/);
const note=z.string().trim().min(1).max(4000);
const sourceEntry=z.strictObject({id:identifier,bereich:z.enum(knowledgeAreas),titel:z.string().trim().min(1).max(160),
 quelle:knowledgeSource,quellen:z.array(identifier).max(30).optional(),inhalt:note,selbsthilfe:note.optional(),praxis:note.optional(),
 rezeption:note.optional(),warnzeichen:note.optional(),offen:note.optional(),freigabe:note.optional()});
const sourceFile=z.strictObject({version:z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,99}$/),stand:z.string().date(),hinweis:note.optional(),bereiche:z.array(z.enum(knowledgeAreas)),
 quellen:z.record(z.tuple([z.string().trim().min(1).max(250),z.string().max(1000)])),eintraege:z.array(sourceEntry).min(1).max(500)});

/** Stable row key for an editorial identifier, scoped by tenant at the database level. */
function rowId(key:string){
 const hash=createHash('md5').update('animahost:kfo:'+key).digest('hex');
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20)}`;
}

export function parseKfoImport(input:unknown){
 const source=sourceFile.parse(input);
 const references=new Map(Object.entries(source.quellen).map(([key,[name,url]])=>[key,knowledgeReference.parse({key,name,url})]));
 const seen=new Set<string>();
 const entries=source.eintraege.map(item=>{
  if(seen.has(item.id))throw Error('knowledge_duplicate_external_id');
  seen.add(item.id);
  if(!source.bereiche.includes(item.bereich))throw Error('knowledge_area_missing');
  const sources=Array.from(new Set(item.quellen??[])).map(key=>{
   const reference=references.get(key);
   if(!reference)throw Error('knowledge_reference_missing');
   return reference;
  });
  const draft=knowledgeDraft.parse({area:item.bereich,title:item.titel,content:item.inhalt,source:item.quelle==='offen'?'praxis':item.quelle,
   validFrom:source.stand,sources,guidance:{selfHelp:item.selbsthilfe,practice:item.praxis,reception:item.rezeption,warningSigns:item.warnzeichen},
   openQuestion:item.offen??null});
  return {id:rowId(item.id),externalId:item.id,area:draft.area,title:draft.title,content:draft.content,source:draft.source,
   validFrom:draft.validFrom,metadata:{sources:draft.sources,guidance:draft.guidance,openQuestion:draft.openQuestion,
    sourceApprovalNote:item.freigabe??null,originalSource:item.quelle,importVersion:source.version,importDate:source.stand}};
 });
 return {fileVersion:source.version,fileDate:source.stand,entries};
}

export function bundledKfoImport(){return parseKfoImport(file);}

export function bundledKfoPreview(){
 const draft=bundledKfoImport();
 const entries:ApprovedKnowledge[]=draft.entries.map(item=>({id:item.id,version:1,area:item.area,title:item.title,
  content:item.content,source:item.source,guidance:item.metadata.guidance}));
 return {fileVersion:draft.fileVersion,entries};
}
