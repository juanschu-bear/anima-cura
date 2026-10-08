import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { extractAppRole } from './auth';
import { effektiveStufe } from './permissions';
import { canReadBilling, previousBillingQuarter, validBillingPeriod } from './billing-readiness';
import { scribeBillingCandidates } from './billing-foundation';
import { reviewService, serviceInput, sourceIsCurrent, tariffInput, workspaceCommand, type BillingVersion } from './billing-workspace';
import { t } from './i18n';

type Client=Pick<SupabaseClient,'auth'|'from'|'rpc'>;
export function billingWorkspaceHandler(session:()=>Client,admin:()=>Client){
  return async(request:Request)=>{
    const url=new URL(request.url),locale=url.searchParams.get('lang')==='en'?'en':'de';
    const headers={'Cache-Control':'private, no-store',Vary:'Cookie'};
    const respond=(data:unknown,status=200)=>Response.json(data,{status,headers});
    const fail=(key:string,status:number)=>respond({error:t(`billing.work.${key}`,locale)},status);
    try{
      const client=session();
      const {data:{user},error:authError}=await client.auth.getUser();
      if(authError||!user)return fail('signIn',401);
      const {data:profile,error:profileError}=await client.from('user_profiles').select('role,permissions').eq('id',user.id).maybeSingle();
      if(profileError)return fail('unavailable',503);
      const role=extractAppRole(profile?.role);
      if(!canReadBilling(role,profile?.permissions))return fail('forbidden',403);
      const writable=effektiveStufe(role,profile?.permissions,'rechnungen')==='schreiben';
      if(request.method!=='GET'&&!writable)return fail('forbidden',403);
      if(request.method!=='GET'){
        if(request.headers.get('origin')!==url.origin || !request.headers.get('content-type')?.startsWith('application/json'))return fail('forbidden',403);
      }
      const db=admin();
      if(request.method==='GET'){
        const kind=url.searchParams.get('kind');
        const page=Number(url.searchParams.get('page')??'0');
        if(!['tariff','service','source'].includes(kind??'')||!Number.isSafeInteger(page)||page<0||page>10000)return fail('invalid',400);
        if(kind==='source'){
          const patientId=url.searchParams.get('patientId');
          const fallback=previousBillingQuarter(new Date());
          const from=url.searchParams.get('from')??fallback.from,to=url.searchParams.get('to')??fallback.to;
          if(!z.string().uuid().safeParse(patientId).success||!validBillingPeriod(from,to))return fail('invalid',400);
          const {data,error}=await client.from('doku_eintraege').select('id,patient_id,version,termin_datum,status,bestaetigt_am,positionen').eq('patient_id',patientId!).eq('status','bestaetigt').gte('termin_datum',from).lte('termin_datum',to).order('id').range(page*25,page*25+25);
          if(error)return fail('unavailable',503);
          const entries=(data??[]).slice(0,25);
          const candidates=scribeBillingCandidates(entries);
          return respond({lines:candidates.lines,entriesWithoutPositions:candidates.entriesWithoutPositions.length,hasMore:(data??[]).length>25,writable});
        }
        const historyId=url.searchParams.get('history');
        if(historyId){
          if(!z.string().uuid().safeParse(historyId).success)return fail('invalid',400);
          const {data,error}=await db.from('billing_versions').select('*').eq('record_id',historyId).order('revision',{ascending:false}).range(page*25,page*25+25);
          if(error)return fail('unavailable',503);
          return respond({versions:(data??[]).slice(0,25),hasMore:(data??[]).length>25,writable});
        }
        let query=db.from('billing_records').select('*').eq('kind',kind).order('id').range(page*25,page*25+25);
        if(kind==='service'){
          const patientId=url.searchParams.get('patientId');
          if(!z.string().uuid().safeParse(patientId).success)return fail('invalid',400);
          query=query.eq('patient_id',patientId!);
        }
        const {data:records,error}=await query;
        if(error)return fail('unavailable',503);
        const selected=(records??[]).slice(0,25);
        const {data:versions,error:versionError}=selected.length?await db.from('billing_versions').select('*').or(selected.map(r=>`and(record_id.eq.${r.id},revision.eq.${r.head_version})`).join(',')): {data:[],error:null};
        if(versionError)return fail('unavailable',503);
        const items=selected.map(r=>({...r,current:versions?.find(v=>v.record_id===r.id&&v.revision===r.head_version)}));
        if(items.some(r=>!r.current))return fail('unavailable',503);
        // Surface stale confirmed Scribe snapshots without rewriting historical decisions.
        const sourceIds=items.filter(r=>r.current.data.source?.system==='scribe').map(r=>r.current.data.source.recordId);
        const {data:entries,error:sourceError}=sourceIds.length?await db.from('doku_eintraege').select('id,patient_id,version,termin_datum,status,bestaetigt_am,positionen').in('id',sourceIds):{data:[],error:null};
        if(sourceError)return fail('unavailable',503);
        const tariffIds=items.flatMap(r=>r.current.tariff_version_id?[r.current.tariff_version_id]:[]);
        const {data:tariffs,error:tariffError}=tariffIds.length?await db.from('billing_versions').select('*').in('id',tariffIds):{data:[],error:null};
        if(tariffError)return fail('unavailable',503);
        return respond({items:items.map(r=>({...r,sourceCurrent:kind==='tariff'||sourceIsCurrent(r.current.data,entries?.find(e=>e.id===r.current.data.source?.recordId)??null)})),tariffs,hasMore:(records??[]).length>25,writable});
      }
      if(request.method!=='POST')return fail('invalid',405);
      const requestId=request.headers.get('idempotency-key');
      if(!z.string().uuid().safeParse(requestId).success)return fail('invalid',400);
      const body=await request.text();
      if(body.length>30000)return fail('invalid',413);
      let raw:unknown;try{raw=JSON.parse(body);}catch{return fail('invalid',400);}
      const parsed=workspaceCommand.safeParse(raw);
      if(!parsed.success)return respond({error:t('billing.work.invalid',locale),fields:Array.from(new Set(parsed.error.issues.map(i=>i.path.join('.'))))},400);
      let input:Record<string,unknown>=parsed.data;
      // Recover a committed response before revalidating changed source/state on a retry.
      const {data:retry,error:retryError}=await db.from('billing_requests').select('actor_id,request,result_id').eq('id',requestId!).maybeSingle();
      if(retryError)return fail('unavailable',503);
      if(retry){
        const {grossCents:ignored,...original}=retry.request;
        const normalize=(v:unknown):unknown=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,normalize(x)])):v;
        if(retry.actor_id!==user.id||JSON.stringify(normalize(original))!==JSON.stringify(normalize(input)))return fail('conflict',409);
        return respond({id:retry.result_id,replayed:true});
      }
      if(parsed.data.action==='save'){
        if(parsed.data.kind==='service'){
          const data=parsed.data.data;
          const {data:patient,error}=await client.from('patients').select('id').eq('id',data.patientId).maybeSingle();
          if(error)return fail('unavailable',503);if(!patient)return fail('notFound',404);
          if(data.source.system==='scribe'){
            if(!z.string().uuid().safeParse(data.source.recordId).success)return fail('invalid',400);
            const {data:entry,error:sourceError}=await db.from('doku_eintraege').select('id,patient_id,version,termin_datum,status,bestaetigt_am,positionen').eq('id',data.source.recordId).maybeSingle();
            if(sourceError)return fail('unavailable',503);if(!sourceIsCurrent(data,entry))return fail('stale',409);
          }
        }
      }else{
        const {data:version,error}=await db.from('billing_versions').select('*').eq('id',parsed.data.versionId).maybeSingle();
        if(error)return fail('unavailable',503);if(!version)return fail('notFound',404);
        const {data:record,error:recordError}=await db.from('billing_records').select('*').eq('id',version.record_id).maybeSingle();
        if(recordError||!record)return fail('unavailable',503);
        if(parsed.data.action==='approve'){
          if(record.kind==='tariff'){
            if(!tariffInput.safeParse(version.data).success)return fail('invalid',409);
          }else{
            if(!serviceInput.safeParse(version.data).success)return fail('invalid',409);
            const {data:tariff,error:tariffError}=version.tariff_version_id?await db.from('billing_versions').select('*').eq('id',version.tariff_version_id).maybeSingle():{data:null,error:null};
            if(tariffError)return fail('unavailable',503);
            const review=reviewService(version.data,tariff as BillingVersion|null,user.id,new Date().toISOString());
            if(!review.ok)return respond({error:t('billing.work.incomplete',locale),issues:review.issues},409);
            input={...input,grossCents:review.grossCents};
          }
        }
      }
      const {data:id,error}=await db.rpc('billing_write',{p_actor:user.id,p_request_id:requestId,p_input:input});
      if(error){
        if(error.message.includes('forbidden'))return fail('forbidden',403);
        if(error.message.includes('source_stale'))return fail('stale',409);
        if(error.code==='23505'||/conflict|immutable|mismatch|unapproved/.test(error.message))return fail('conflict',409);
        return fail('unavailable',503);
      }
      return respond({id});
    }catch{return fail('unavailable',503);}
  };
}
