import { z } from 'zod';
import type {createServerClient} from '@/lib/db/supabase';

export const knowledgeAreas=['apparatur','problem','selbsthilfe','warnzeichen','behandlungsphase','praxisablauf','begriff','gespraech'] as const;
export const knowledgeSource=z.enum(['fachlich','praxis','offen']);
export const knowledgeReference=z.strictObject({key:z.string().regex(/^[a-z0-9_-]{1,64}$/),name:z.string().trim().min(1).max(250),
 url:z.string().max(1000).url().refine(value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}})});
const detail=z.string().trim().min(1).max(4000);
export const knowledgeGuidance=z.strictObject({selfHelp:detail.optional(),practice:detail.optional(),reception:detail.optional(),warningSigns:detail.optional()});
const knowledgeFields=z.strictObject({area:z.enum(knowledgeAreas),title:z.string().trim().min(1).max(160),
 content:z.string().trim().min(1).max(4000),source:knowledgeSource});
export const knowledgeDraft=knowledgeFields.extend({validFrom:z.string().date(),sources:z.array(knowledgeReference).max(30).optional(),
 guidance:knowledgeGuidance.optional(),openQuestion:detail.nullable().optional()});
export const approvedKnowledgeSchema=knowledgeFields.extend({id:z.string().uuid(),version:z.number().int().positive(),
 guidance:knowledgeGuidance.optional()});
export type ApprovedKnowledge=z.infer<typeof approvedKnowledgeSchema>;

export async function activeKnowledge(db:ReturnType<typeof createServerClient>,tenantId:string,day:string){
 const params={p_tenant:tenantId,p_day:day};
 const detailed=await db.rpc('animahost_active_knowledge_details',params);
 const result=['PGRST202','42883'].includes(detailed.error?.code??'')?await db.rpc('animahost_active_knowledge',params):detailed;
 if(result.error){
  if(['PGRST202','42883'].includes(result.error.code))return {available:false,entries:[] satisfies ApprovedKnowledge[]};
  throw Error('knowledge_unavailable');
 }
 return {available:true,entries:z.array(approvedKnowledgeSchema).parse(result.data)};
}

export function knowledgeRecord(row:Record<string,unknown>){
 const metadata=(row.metadata??{}) as Record<string,unknown>;
 return {id:row.id,version:row.version,area:row.area,title:row.title,content:row.content,source:row.source,
  active:row.active,status:row.approved_at?(row.active?'approved':'deactivated'):'draft',
  validFrom:row.valid_from,approvedAt:row.approved_at,approvedBy:row.approved_by,
  createdAt:row.created_at,createdBy:row.created_by,externalId:row.external_id??null,sources:metadata.sources??[],
  guidance:metadata.guidance??{},openQuestion:metadata.openQuestion??null,hasOpenQuestion:typeof metadata.openQuestion==='string',
  sourceApprovalNote:metadata.sourceApprovalNote??null,importVersion:metadata.importVersion??null,importDate:metadata.importDate??null};
}
