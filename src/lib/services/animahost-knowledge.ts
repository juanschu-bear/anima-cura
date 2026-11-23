import { z } from 'zod';
import type {createServerClient} from '@/lib/db/supabase';

export const knowledgeAreas=['apparatur','problem','selbsthilfe','warnzeichen','behandlungsphase','praxisablauf','begriff'] as const;
const knowledgeFields=z.strictObject({area:z.enum(knowledgeAreas),title:z.string().trim().min(1).max(160),
 content:z.string().trim().min(1).max(4000),source:z.enum(['fachlich','praxis'])});
export const knowledgeDraft=knowledgeFields.extend({validFrom:z.string().date()});
export const approvedKnowledgeSchema=knowledgeFields.extend({id:z.string().uuid(),version:z.number().int().positive()});
export type ApprovedKnowledge=z.infer<typeof approvedKnowledgeSchema>;

export async function activeKnowledge(db:ReturnType<typeof createServerClient>,tenantId:string,day:string){
 const result=await db.rpc('animahost_active_knowledge',{p_tenant:tenantId,p_day:day});
 if(result.error){
  if(['PGRST202','42883'].includes(result.error.code))return {available:false,entries:[] satisfies ApprovedKnowledge[]};
  throw Error('knowledge_unavailable');
 }
 return {available:true,entries:z.array(approvedKnowledgeSchema).parse(result.data)};
}

export function knowledgeRecord(row:Record<string,unknown>){
 return {id:row.id,version:row.version,area:row.area,title:row.title,content:row.content,source:row.source,
  active:row.active,validFrom:row.valid_from,approvedAt:row.approved_at,approvedBy:row.approved_by,
  createdAt:row.created_at,createdBy:row.created_by};
}
