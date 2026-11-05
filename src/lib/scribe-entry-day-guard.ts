import type {SupabaseClient} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';
const missing=(error:{code?:string}|null)=>error?.code==='42P01'||error?.code==='PGRST205';
export async function canonicalDayConflict(db:SupabaseClient,entryId:string){
 const {data,error}=await db.from('doku_tagesdatensaetze').select('id,canonical_entry_id').eq('canonical_entry_id',entryId).maybeSingle();
 if(error&&!missing(error))return NextResponse.json({code:'day_guard_unavailable'},{status:503});
 return data?NextResponse.json({code:'day_record_correction_required',error:'day_record_correction_required',dayRecordId:data.id,entryId,correctionPath:`/api/doku/tagesdatensatz/${data.id}/teile`},{status:409}):null;
}
export async function existingDayConflict(db:SupabaseClient,patientId:string,date:string,excludeId?:string|null){
 let query=db.from('doku_eintraege').select('*').eq('patient_id',patientId).eq('termin_datum',date).eq('status','bestaetigt').order('created_at',{ascending:true}).order('id',{ascending:true}).limit(1);
 if(excludeId)query=query.neq('id',excludeId);
 const {data,error}=await query;
 if(error)return NextResponse.json({code:'day_guard_unavailable'},{status:503});
 if(!data?.length)return null;
 return NextResponse.json({code:'day_record_exists',error:'day_record_exists',eintrag:data[0]},{status:409});
}
export async function dayGuardDatabaseError(db:SupabaseClient,error:{message:string;details?:string;code?:string},patientId:string,date:string,entryId?:string){
 if(error.code==='40001')return await existingDayConflict(db,patientId,date,entryId)??NextResponse.json({code:'day_record_conflict'},{status:409});
 if(error.message==='day_record_exists')return await existingDayConflict(db,patientId,date,entryId)??NextResponse.json({code:'day_record_exists',error:'day_record_exists'},{status:409});
 if(error.message==='day_record_correction_required')return entryId?await canonicalDayConflict(db,entryId)??NextResponse.json({code:'day_record_correction_required'},{status:409}):NextResponse.json({code:'day_record_correction_required'},{status:409});
 return null;
}
