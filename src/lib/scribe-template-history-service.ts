import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerClient } from './db/supabase';
import {projectTemplate,projectTemplatesSafely,slotsAt,type HistoryTemplate,type TemplateProjectionError,type TemplateSlot,type TemplateStateChange} from './scribe-template-history';
import {storageError} from './scribe-workspace-auth';
export const SCRIBE_PRACTICE=process.env.SCRIBE_PRAXIS_ID||'praxis-schubert';
export async function historySlots(ids:string[],db:Pick<SupabaseClient,'from'>=createServerClient()):Promise<TemplateSlot[]|null>{
 const slots:TemplateSlot[]=[];
 if(!ids.length)return slots;
 for(let start=0;;start+=500){
  const r=await db.from('scribe_option_slots').select('*').eq('praxis_id',SCRIBE_PRACTICE).in('template_id',ids).order('option_key').range(start,start+499);
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
  const result=await db.from('scribe_option_changes').select('id,template_id,option_key,after_state,created_at,seq')
   .eq('praxis_id',SCRIBE_PRACTICE).in('template_id',ids).lte('created_at',at)
   .order('seq',{ascending:true}).range(start,start+499);
  if(result.error)storageError(result.error);
  changes.push(...(result.data??[]) as TemplateStateChange[]);if((result.data?.length??0)<500)break;
 }
 const historical=slotsAt(current,changes,at);
 return rows.map(row=>projectTemplate(row,historical));
}
export async function changeTemplate(actorId:string,request:unknown){
 const {data,error}=await createServerClient().rpc('scribe_template_change',{p_actor:actorId,p_practice:SCRIBE_PRACTICE,p_request:request});
 if(error)storageError(error);return data;
}
