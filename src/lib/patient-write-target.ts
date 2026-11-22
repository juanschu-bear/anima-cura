/** Never select a patient for a mutation by an arbitrary first matching row. */
export async function patientWriteTarget(db:any,params:Record<string,any>){
 const id=params.patient_id;const name=String(params.patient_name||'').trim();
 if(id&&!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))return {error:'invalid_patient_id'};
 if(!id&&(!name||/[%_,()*]/.test(name)))return {error:'patient_id_or_exact_surname_required'};
 let q=db.from('patients').select('id,email,vorname,nachname');
 q=id?q.eq('id',id):q.ilike('nachname',name);
 const {data,error}=await q.limit(2);
 if(error)return {error:'patient_lookup_unavailable'};
 if(!data?.length)return {error:'patient_not_found'};
 if(data.length!==1)return {error:'patient_ambiguous',candidates:data.map((p:any)=>({id:p.id,vorname:p.vorname,nachname:p.nachname}))};
 return {patient:data[0]};
}
