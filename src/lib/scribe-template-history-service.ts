import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from './db/supabase';
import {projectTemplate,projectTemplatesSafely,slotsAt,type HistoryTemplate,type TemplateProjectionError,type TemplateSlot,type TemplateStateChange} from './scribe-template-history';
import {storageError} from './scribe-workspace-auth';
import {reviewTemplateChange} from './scribe-template-change-review';
export const SCRIBE_PRACTICE=process.env.SCRIBE_PRAXIS_ID||'praxis-schubert';
async function readTwice<T extends {error?:unknown}>(read:()=>PromiseLike<T>):Promise<T>{const first=await read();return first.error?await read():first;}
export async function historySlots(ids:string[],db:Pick<SupabaseClient,'from'>=createServerClient()):Promise<TemplateSlot[]|null>{
 const slots:TemplateSlot[]=[];
 if(!ids.length)return slots;
 for(let start=0;;start+=500){
  const r=await readTwice(()=>db.from('scribe_option_slots').select('*').eq('praxis_id',SCRIBE_PRACTICE).in('template_id',ids).order('option_key').range(start,start+499));
  if(r.error){if(['42P01','PGRST205'].includes(r.error.code))return null;storageError(r.error);}
  slots.push(...(r.data??[]) as TemplateSlot[]);
  if((r.data??[]).length<500)return slots;
 }
}
export async function effectiveTemplates<T extends HistoryTemplate>(rows:T[]):Promise<T[]|null>{
 let slots=await historySlots(rows.map(r=>r.id));
 if(slots===null)return null; // Only missing installation permits legacy read fallback.
 return rows.map(r=>projectTemplate(r,slots??[]));
}

export async function effectiveTemplatesSafely<T extends HistoryTemplate>(rows:T[]):Promise<{
 templates:T[];errors:TemplateProjectionError[]
}|null>{
 const slots=await historySlots(rows.map(r=>r.id));
 if(slots===null)return null;
 return projectTemplatesSafely(rows,slots);
}

/** Reconstruct the immutable option state that existed when an entry was confirmed. */
export async function effectiveTemplatesAt<T extends HistoryTemplate>(rows:T[],at:string,db:Pick<SupabaseClient,'from'>=createServerClient()):Promise<T[]|null>{
 const current=await historySlots(rows.map(r=>r.id),db);
 if(current===null)return null;
 const ids=rows.map(r=>r.id);const changes:TemplateStateChange[]=[];
 for(let start=0;;start+=500){
  const result=await readTwice(()=>db.from('scribe_option_changes').select('id,template_id,option_key,after_state,created_at,seq')
   .eq('praxis_id',SCRIBE_PRACTICE).in('template_id',ids).lte('created_at',at)
   .order('seq',{ascending:true}).range(start,start+499));
  if(result.error)storageError(result.error);
  changes.push(...(result.data??[]) as TemplateStateChange[]);if((result.data?.length??0)<500)break;
 }
 const historical=slotsAt(current,changes,at);
 return rows.map(row=>{
  try{return projectTemplate(row,historical);}
  catch(error){
   // A confirmed entry must remain exportable even when today's slot layout is
   // damaged. Its stored text, selections and positions remain visible and the
   // consistency result is carried as a warning by billing-export.
   if(error instanceof Error&&error.message==='template_layout_changed')return structuredClone(row);
   throw error;
  }
 });
}
export async function templateChangeReview(request:{templateId:string;action:string;[key:string]:unknown},db:Pick<SupabaseClient,'from'>=createServerClient()){
 const templateResult=await readTwice(()=>db.from('doku_vorlagen').select('id,struktur,positionen').eq('id',request.templateId).single());
 if(templateResult.error||!templateResult.data)storageError(templateResult.error??{message:'option_not_found'});
 const slots=await historySlots([request.templateId],db);if(slots===null)storageError({message:'scribe_workspace_unavailable'});
 const changes:Array<TemplateStateChange&{before_state?:{text:string;hidden:boolean}}>=[];
 if(request.action==='undo'||request.action==='restore_at')for(let start=0;;start+=500){
  const result=await readTwice(()=>db.from('scribe_option_changes').select('id,option_key,before_state,after_state,created_at,seq')
   .eq('template_id',request.templateId).eq('praxis_id',SCRIBE_PRACTICE).order('seq',{ascending:true}).range(start,start+499));
  if(result.error)storageError(result.error);changes.push(...(result.data??[]) as typeof changes);if((result.data?.length??0)<500)break;
 }
 return reviewTemplateChange(templateResult.data as never,slots??[],request,changes);
}
export async function changeTemplate(actorId:string|null,request:unknown){
 const {data,error}=await createServerClient().rpc('scribe_template_change',{p_actor:actorId,p_practice:SCRIBE_PRACTICE,p_request:request});
 if(error)storageError(error);return data;
}
