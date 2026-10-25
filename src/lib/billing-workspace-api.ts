import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { extractAppRole } from './auth';
import { effektiveStufe } from './permissions';
import { canReadBilling, previousBillingQuarter, validBillingPeriod } from './billing-readiness';
import { scribeBillingCandidates } from './billing-foundation';
import { importTariffsCommand, prepareSourceCommand, reviewService, serviceInput, sourceIsCurrent, summarizeBillingQuarter, tariffInput, workspaceCommand, type BillingVersion } from './billing-workspace';
import { t } from './i18n';
import { payerAllocationCommand } from './billing-payer-allocation';
import { buildIssuedInvoicePdf, issueInvoiceCommand } from './billing-invoice';
import { berlinBillingDate, buildInvoiceCancellationPdf, cancelInvoiceCommand } from './billing-invoice-cancellation';
import { BILLING_DOCUMENTS_BUCKET, billingDocumentPath } from './billing-document-access';

type Client=Pick<SupabaseClient,'auth'|'from'|'rpc'|'storage'>;
function stableUuid(value:string){
  const hex=createHash('sha256').update(value).digest('hex').slice(0,32).split('');
  hex[12]='4';hex[16]=((parseInt(hex[16],16)&3)|8).toString(16);
  return `${hex.slice(0,8).join('')}-${hex.slice(8,12).join('')}-${hex.slice(12,16).join('')}-${hex.slice(16,20).join('')}-${hex.slice(20).join('')}`;
}
function canonicalJson(value:unknown):string{
  const normalize=(item:unknown):unknown=>Array.isArray(item)?item.map(normalize):item&&typeof item==='object'?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)).map(([key,nested])=>[key,normalize(nested)])):item;
  return JSON.stringify(normalize(value));
}
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
        if(!['tariff','service','source','queue','quarter','payer'].includes(kind??'')||!Number.isSafeInteger(page)||page<0||page>10000)return fail('invalid',400);
        if(kind==='payer'){
          const patientId=url.searchParams.get('patientId'),fallback=previousBillingQuarter(new Date());
          const from=url.searchParams.get('from')??fallback.from,to=url.searchParams.get('to')??fallback.to;
          if(!z.string().uuid().safeParse(patientId).success||!validBillingPeriod(from,to))return fail('invalid',400);
          const {data:records,error:recordError}=await db.from('billing_records').select('*').eq('kind','service').eq('patient_id',patientId!);
          if(recordError)return fail('unavailable',503);
          const recordIds=(records??[]).map(record=>record.id);
          const {data:versions,error:versionError}=recordIds.length?await db.from('billing_versions').select('*').in('record_id',recordIds):{data:[],error:null};
          if(versionError)return fail('unavailable',503);
          const lines=(records??[]).map(record=>(versions??[]).find(version=>version.record_id===record.id&&version.revision===record.head_version))
            .filter((version:any)=>version?.state==='approved'&&version.data?.serviceDate>=from&&version.data?.serviceDate<=to)
            .map((version:any)=>({id:version.id,schedule:version.data.schedule,code:version.data.code,description:version.data.description,serviceDate:version.data.serviceDate,grossCents:version.gross_cents}));
          const caseId=stableUuid(`billing-payer-case:${patientId}:${from}:${to}`);
          const {data:payerCase,error:caseError}=await db.from('billing_payer_cases').select('*').eq('id',caseId).maybeSingle();
          if(caseError)return fail('unavailable',503);
          const {data:current,error:currentError}=payerCase?await db.from('billing_payer_versions').select('*').eq('case_id',caseId).eq('revision',payerCase.head_version).maybeSingle():{data:null,error:null};
          if(currentError)return fail('unavailable',503);
          const {data:invoice,error:invoiceError}=current?await db.from('billing_invoices').select('id,invoice_number,issue_date,due_date,total_cents,status,document_id,issued_at,replaces_invoice_id').eq('payer_version_id',current.id).maybeSingle():{data:null,error:null};
          if(invoiceError)return fail('unavailable',503);
          const {data:cancellation,error:cancellationError}=invoice?await db.from('billing_invoice_cancellations').select('id,invoice_id,cancellation_number,cancellation_date,reason,document_id').eq('invoice_id',invoice.id).maybeSingle():{data:null,error:null};
          if(cancellationError)return fail('unavailable',503);
          const {data:originalInvoice,error:originalError}=invoice?.replaces_invoice_id?await db.from('billing_invoices').select('invoice_number,document_id').eq('id',invoice.replaces_invoice_id).eq('patient_id',patientId).maybeSingle():{data:null,error:null};
          if(originalError)return fail('unavailable',503);
          return respond({caseId,from,to,lines,payerCase,current,invoice,cancellation,originalInvoice,writable});
        }
        if(kind==='quarter'){
          const fallback=previousBillingQuarter(new Date()),from=url.searchParams.get('from')??fallback.from,to=url.searchParams.get('to')??fallback.to;
          if(!validBillingPeriod(from,to))return fail('invalid',400);
          const sourceResult=await client.from('doku_eintraege').select('id,patient_id,version,termin_datum,status,bestaetigt_am,positionen',{count:'exact'})
            .eq('status','bestaetigt').gte('termin_datum',from).lte('termin_datum',to).order('id').range(0,999);
          if(sourceResult.error||sourceResult.count&&sourceResult.count>1000||sourceResult.count===null&&(sourceResult.data??[]).length===1000)return fail('catalogLimit',409);
          const entries=sourceResult.data??[],sourceIds=entries.map(entry=>entry.id),records:any[]=[];
          for(let index=0;index<sourceIds.length;index+=100){
            const result=await db.from('billing_records').select('*').eq('kind','service').eq('source_system','scribe').in('source_record_id',sourceIds.slice(index,index+100));
            if(result.error)return fail('unavailable',503);records.push(...(result.data??[]));
          }
          const versions:any[]=[];
          for(let index=0;index<records.length;index+=100){
            const result=await db.from('billing_versions').select('*').in('record_id',records.slice(index,index+100).map(record=>record.id));
            if(result.error)return fail('unavailable',503);versions.push(...(result.data??[]));
          }
          const aggregate=summarizeBillingQuarter(entries,records,versions);
          const ordered=[...aggregate.cases].sort((a,b)=>Number(a.ready)-Number(b.ready)||b.missing-a.missing||a.patientId.localeCompare(b.patientId));
          const pageSize=15,pageCases=ordered.slice(page*pageSize,page*pageSize+pageSize),patientIds=pageCases.map(item=>item.patientId);
          const {data:patients,error:patientError}=patientIds.length?await db.from('patients').select('id,ivoris_nummer,vorname,nachname,geburtsdatum').in('id',patientIds):{data:[],error:null};
          if(patientError)return fail('unavailable',503);
          const cases=pageCases.map(item=>{const patient=(patients??[]).find(row=>row.id===item.patientId);return {...item,patient:{id:item.patientId,name:patient?`${patient.vorname??''} ${patient.nachname??''}`.trim():t('billing.work.unknownPatient',locale),ivoris_nummer:patient?.ivoris_nummer??null,geburtsdatum:patient?.geburtsdatum??null}};});
          const {cases:ignoredCases,...totals}=aggregate;
          return respond({from,to,...totals,cases,caseHasMore:ordered.length>(page+1)*pageSize,writable});
        }
        if(kind==='queue'){
          const pageSize=15;
          const {data:entries,error}=await client.from('doku_eintraege')
            .select('id,patient_id,version,termin_datum,status,bestaetigt_am,positionen')
            .eq('status','bestaetigt').order('termin_datum',{ascending:false}).order('id',{ascending:false})
            .range(page*pageSize,page*pageSize+pageSize);
          if(error)return fail('unavailable',503);
          const selected=(entries??[]).slice(0,pageSize);
          const patientIds=Array.from(new Set(selected.map(e=>e.patient_id).filter(Boolean)));
          const sourceIds=selected.map(e=>e.id);
          const {data:patients,error:patientError}=patientIds.length
            ?await db.from('patients').select('id,ivoris_nummer,vorname,nachname,geburtsdatum').in('id',patientIds)
            :{data:[],error:null};
          if(patientError)return fail('unavailable',503);
          const {data:records,error:recordError}=sourceIds.length
            ?await db.from('billing_records').select('*').eq('kind','service').eq('source_system','scribe').in('source_record_id',sourceIds)
            :{data:[],error:null};
          if(recordError)return fail('unavailable',503);
          const recordIds=(records??[]).map(r=>r.id);
          const {data:versions,error:versionError}=recordIds.length
            ?await db.from('billing_versions').select('*').in('record_id',recordIds)
            :{data:[],error:null};
          if(versionError)return fail('unavailable',503);
          const current=(records??[]).map(record=>({record,version:(versions??[]).find(v=>v.record_id===record.id&&v.revision===record.head_version)}));
          const cases=selected.map(entry=>{
            const patient=(patients??[]).find(p=>p.id===entry.patient_id);
            const proposals=scribeBillingCandidates([entry]);
            const linked=current.filter(item=>item.record.source_record_id===entry.id);
            const states={draft:0,approved:0,withdrawn:0};
            let stale=0;
            for(const item of linked){
              if(item.version?.state in states)states[item.version.state as keyof typeof states]++;
              if(!item.version||!sourceIsCurrent(item.version.data,entry))stale++;
            }
            const incomplete=proposals.lines.filter((line:any)=>!line.schedule||!line.code||!line.description||!line.quantity).length;
            const total=proposals.lines.length;
            const recordedPositions=new Set(linked.map(item=>item.record.source_position_index)).size;
            const status=stale>0?'stale':incomplete>0?'needs_data':states.draft>0?'in_review':total>0&&states.approved===total?'approved':recordedPositions>0?'partial':'not_started';
            return {sourceId:entry.id,serviceDate:entry.termin_datum,sourceVersion:entry.version,patient:{id:entry.patient_id,name:patient?`${patient.vorname??''} ${patient.nachname??''}`.trim():t('billing.work.unknownPatient',locale),ivoris_nummer:patient?.ivoris_nummer??null,geburtsdatum:patient?.geburtsdatum??null},totalPositions:total,recordedPositions,incompletePositions:incomplete,states,stale,status};
          });
          return respond({cases,hasMore:(entries??[]).length>pageSize,writable});
        }
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
      const cancellation=cancelInvoiceCommand.safeParse(raw);
      if(cancellation.success){
        const {invoiceId,reason}=cancellation.data;
        const {data:invoice,error:invoiceError}=await db.from('billing_invoices').select('*').eq('id',invoiceId).maybeSingle();
        if(invoiceError)return fail('unavailable',503);
        if(!invoice)return fail('invalid',404);
        const {data:existing,error:existingError}=await db.from('billing_invoice_cancellations').select('*').eq('invoice_id',invoice.id).maybeSingle();
        if(existingError)return fail('unavailable',503);
        if(existing){
          if(existing.reason!==reason)return fail('conflict',409);
          return respond({id:invoice.id,status:'void',documentId:existing.document_id});
        }
        if(invoice.status!=='issued')return fail('conflict',409);
        const cancellationDate=berlinBillingDate();
        // Different reasons/dates use different files, so a losing concurrent
        // request can never overwrite the successful immutable cancellation PDF.
        const documentId=stableUuid(`billing-cancellation:${invoice.id}:${cancellationDate}:${reason}`);
        const rendered=await buildInvoiceCancellationPdf({original:invoice.snapshot,cancellationDate,reason});
        const {data:bucket,error:bucketError}=await db.storage.getBucket(BILLING_DOCUMENTS_BUCKET);
        if(bucketError||!bucket)return fail('unavailable',503);
        if(bucket.public)return fail('invoiceStorageUnsafe',409);
        const storagePath=billingDocumentPath(invoice.patient_id,documentId);
        const upload=await db.storage.from(BILLING_DOCUMENTS_BUCKET).upload(storagePath,rendered.pdf,{contentType:'application/pdf',cacheControl:'0',upsert:true});
        if(upload.error)return fail('unavailable',503);
        const {data:id,error}=await db.rpc('billing_invoice_cancel',{p_actor:user.id,p_request_id:requestId,p_invoice_id:invoice.id,p_document_id:documentId,
          p_date:cancellationDate,p_reason:reason,p_pdf_sha256:rendered.sha256,p_pdf_bytes:rendered.pdf.length,p_storage_path:storagePath});
        if(error){
          if(error.message.includes('forbidden'))return fail('forbidden',403);
          if(error.message.includes('payment_review'))return fail('cancellationPaymentReview',409);
          if(/conflict|invalid|immutable/.test(error.message))return fail('conflict',409);
          return fail('unavailable',503);
        }
        // A parallel same-reason cancellation may have completed with its own
        // document. Always return the actual committed document, never our guess.
        const {data:committed,error:committedError}=await db.from('billing_invoice_cancellations').select('document_id').eq('invoice_id',invoice.id).maybeSingle();
        if(committedError||!committed)return fail('unavailable',503);
        return respond({id,status:'void',documentId:committed.document_id});
      }
      const issuance=issueInvoiceCommand.safeParse(raw);
      if(issuance.success){
        const command={action:'reserve',payerVersionId:issuance.data.payerVersionId,dueDate:issuance.data.dueDate,reason:issuance.data.reason};
        const {data:invoiceId,error:reserveError}=await db.rpc('billing_invoice_reserve',{p_actor:user.id,p_request_id:requestId,p_input:command});
        if(reserveError){
          if(reserveError.message.includes('forbidden'))return fail('forbidden',403);
          if(reserveError.message.includes('already_billed'))return fail('invoiceAlreadyBilled',409);
          if(/unapproved|stale|service_stale/.test(reserveError.message))return fail('invoiceNotReady',409);
          if(/conflict|request_conflict/.test(reserveError.message))return fail('conflict',409);
          return fail('unavailable',503);
        }
        const {data:invoice,error:invoiceError}=await db.from('billing_invoices').select('*').eq('id',invoiceId).maybeSingle();
        if(invoiceError||!invoice)return fail('unavailable',503);
        if(invoice.status==='issued')return respond({id:invoice.id,invoiceNumber:invoice.invoice_number,status:invoice.status,documentId:invoice.document_id});
        const rendered=await buildIssuedInvoicePdf(invoice.snapshot);
        const {data:bucket,error:bucketError}=await db.storage.getBucket(BILLING_DOCUMENTS_BUCKET);
        if(bucketError&&!/not found/i.test(bucketError.message))return fail('unavailable',503);
        if(!bucket){
          const created=await db.storage.createBucket(BILLING_DOCUMENTS_BUCKET,{public:false,fileSizeLimit:25*1024*1024,allowedMimeTypes:['application/pdf']});
          if(created.error)return fail('unavailable',503);
        }else if(bucket.public)return fail('invoiceStorageUnsafe',409);
        const storagePath=billingDocumentPath(invoice.patient_id,invoice.document_id);
        const upload=await db.storage.from(BILLING_DOCUMENTS_BUCKET).upload(storagePath,rendered.pdf,{contentType:'application/pdf',cacheControl:'0',upsert:true});
        if(upload.error)return fail('unavailable',503);
        const {data:finalized,error:finalizeError}=await db.rpc('billing_invoice_finalize',{p_actor:user.id,p_invoice_id:invoice.id,p_pdf_sha256:rendered.sha256,p_pdf_bytes:rendered.pdf.length,p_storage_path:storagePath});
        if(finalizeError){
          if(finalizeError.message.includes('forbidden'))return fail('forbidden',403);
          if(finalizeError.message.includes('already_billed'))return fail('invoiceAlreadyBilled',409);
          if(/stale|unapproved/.test(finalizeError.message))return fail('invoiceNotReady',409);
          if(/conflict|immutable/.test(finalizeError.message))return fail('conflict',409);
          return fail('unavailable',503);
        }
        return respond({id:finalized,invoiceNumber:invoice.invoice_number,status:'issued',documentId:invoice.document_id});
      }
      const payer=payerAllocationCommand.safeParse(raw);
      if(payer.success){
        const command=payer.data.action==='save_payer'
          ?{action:'save',caseId:payer.data.caseId,expectedRevision:payer.data.expectedRevision,reason:payer.data.reason,data:payer.data.data}
          :{action:payer.data.action==='approve_payer'?'approve':'withdraw',versionId:payer.data.versionId,reason:payer.data.reason};
        const {data:id,error}=await db.rpc('billing_payer_write',{p_actor:user.id,p_request_id:requestId,p_input:command});
        if(error){
          if(error.message.includes('forbidden'))return fail('forbidden',403);
          if(/scope_mismatch|model_mismatch|total_mismatch/.test(error.message))return fail('payerMismatch',409);
          if(/conflict|immutable|revision/.test(error.message))return fail('conflict',409);
          return fail('unavailable',503);
        }
        return respond({id});
      }
      const prepare=prepareSourceCommand.safeParse(raw);
      if(prepare.success){
        const {data:entry,error:entryError}=await db.from('doku_eintraege').select('id,patient_id,version,termin_datum,status,bestaetigt_am,positionen').eq('id',prepare.data.sourceId).maybeSingle();
        if(entryError)return fail('unavailable',503);if(!entry)return fail('notFound',404);
        const candidates=scribeBillingCandidates([entry]).lines as Array<Record<string,any>>;
        const {data:existing,error:existingError}=await db.from('billing_records').select('source_position_index').eq('kind','service').eq('source_system','scribe').eq('source_record_id',entry.id);
        if(existingError)return fail('unavailable',503);
        const existingIndexes=new Set((existing??[]).map(row=>row.source_position_index));
        let prepared=0,skippedExisting=0,blocked=0;
        for(const candidate of candidates){
          const positionIndex=candidate.source?.positionIndex;
          if(existingIndexes.has(positionIndex)){skippedExisting++;continue;}
          const data={patientId:candidate.patientId,serviceDate:candidate.serviceDate,schedule:candidate.schedule,code:candidate.code,description:candidate.description,quantity:candidate.quantity,region:candidate.region,factor:candidate.factor,justification:candidate.justification,insurerId:null,tariffVersionId:null,source:candidate.source};
          const validated=serviceInput.safeParse(data);
          if(!validated.success||!sourceIsCurrent(validated.data,entry)){blocked++;continue;}
          const recordId=stableUuid(`billing-record:scribe:${entry.id}:${positionIndex}`);
          const lineRequestId=stableUuid(`billing-request:prepare-v1:${entry.id}:${positionIndex}`);
          const input={action:'save',kind:'service',recordId,expectedRevision:0,reason:'Automatisch aus einem bestätigten Scribe-Quellbeleg als prüfpflichtiger Entwurf vorbereitet.',data:validated.data};
          const {error:writeError}=await db.rpc('billing_write',{p_actor:user.id,p_request_id:lineRequestId,p_input:input});
          if(writeError){
            if(/revision_conflict|request_conflict|duplicate|unique/i.test(writeError.message)){skippedExisting++;continue;}
            return fail('unavailable',503);
          }
          prepared++;
        }
        return respond({prepared,skippedExisting,blocked,total:candidates.length});
      }
      const imported=importTariffsCommand.safeParse(raw);
      if(imported.success){
        const {data:records,error:recordError}=await db.from('billing_records').select('*').eq('kind','tariff').order('id').range(0,500);
        if(recordError)return fail('unavailable',503);if((records??[]).length>500)return fail('catalogLimit',409);
        const recordIds=(records??[]).map(record=>record.id);
        const {data:versions,error:versionError}=recordIds.length?await db.from('billing_versions').select('*').in('record_id',recordIds):{data:[],error:null};
        if(versionError)return fail('unavailable',503);
        const current=(records??[]).map(record=>({record,version:(versions??[]).find(version=>version.record_id===record.id&&version.revision===record.head_version)})).filter(item=>item.version);
        const identity=(data:any)=>[data.schedule,data.code,data.insurerId??'',data.validFrom,data.validTo,data.sourceReference].join('|');
        let created=0,revised=0,unchanged=0;
        for(const tariff of imported.data.tariffs){
          const match=current.find(item=>identity(item.version!.data)===identity(tariff));
          if(match&&canonicalJson(match.version!.data)===canonicalJson(tariff)){unchanged++;continue;}
          const recordId=match?.record.id??stableUuid(`billing-tariff:${identity(tariff)}`);
          const expectedRevision=match?.record.head_version??0;
          const lineRequestId=stableUuid(`billing-request:tariff-import-v1:${recordId}:${canonicalJson(tariff)}`);
          const input={action:'save',kind:'tariff',recordId,expectedRevision,reason:'Kontrollierter Tarifimport; fachliche Freigabe dieser Version steht noch aus.',data:tariff};
          const {error:writeError}=await db.rpc('billing_write',{p_actor:user.id,p_request_id:lineRequestId,p_input:input});
          if(writeError)return /revision_conflict|request_conflict/i.test(writeError.message)?fail('conflict',409):fail('unavailable',503);
          if(match)revised++;else created++;
        }
        return respond({created,revised,unchanged,total:imported.data.tariffs.length});
      }
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
