"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { z } from 'zod';
import { t } from '@/lib/i18n';
import { previousBillingQuarter } from '@/lib/billing-readiness';
import { parseTariffImport, tariffImportTemplate } from '@/lib/billing-tariff-import';
import { reviewService, serviceInput, tariffInput, workspaceCommand, type BillingRecord, type BillingVersion } from '@/lib/billing-workspace';
import styles from './BillingWorkspace.module.css';

type Locale='de'|'en';
type Kind='service'|'tariff';
type Item=BillingRecord & {current:BillingVersion;sourceCurrent:boolean};
type Patient={id:string;name:string;ivoris_nummer?:string;geburtsdatum?:string};
type Service=z.infer<typeof serviceInput>;
type Tariff=z.infer<typeof tariffInput>;
type Command=z.infer<typeof workspaceCommand>;
type Candidate=Omit<Service,'schedule'|'insurerId'|'tariffVersionId'> & {schedule:Service['schedule']|null};
type Editing={id:string;revision:number;kind:Kind;data?:Service|Tariff};
type QueueCase={sourceId:string;serviceDate:string;sourceVersion:number;patient:Patient;totalPositions:number;recordedPositions:number;incompletePositions:number;states:{draft:number;approved:number;withdrawn:number};stale:number;status:'stale'|'needs_data'|'in_review'|'approved'|'partial'|'not_started'};
type QuarterCase={patientId:string;patient:Patient;positions:number;approved:number;missing:number;incomplete:number;draft:number;withdrawn:number;stale:number;emptyEntries:number;ready:boolean};
type QuarterSummary={from:string;to:string;confirmedEntries:number;entriesWithoutPositions:number;sourcePositions:number;missingPositions:number;incompletePositions:number;draftPositions:number;approvedPositions:number;withdrawnPositions:number;stalePositions:number;approvedGrossCents:number;patients:number;readyPatients:number;blockedPatients:number;cases:QuarterCase[];caseHasMore:boolean};
const schedules=['BEMA','GOZ','LABOR','MATERIAL'] as const;

async function getData(query:URLSearchParams,locale:Locale,signal?:AbortSignal){
  query.set('lang',locale);
  const response=await fetch(`/api/rechnungen/catalog?${query}`,{cache:'no-store',signal});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||t('billing.work.unavailable',locale));
  return data;
}

export default function BillingWorkspace({locale,theme}:{locale:Locale;theme:string}){
  const tr=(key:string)=>t(`billing.work.${key}`,locale);
  const [kind,setKind]=useState<Kind>('service');
  const [patient,setPatient]=useState<Patient|null>(null);
  const [search,setSearch]=useState('');
  const [results,setResults]=useState<Patient[]>([]);
  const [items,setItems]=useState<Item[]>([]);
  const [tariffs,setTariffs]=useState<BillingVersion[]>([]);
  const [page,setPage]=useState(0),[hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(false),[writable,setWritable]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const [refresh,setRefresh]=useState(0),[editing,setEditing]=useState<Editing|null>(null);
  const [decision,setDecision]=useState<{item:Item;action:'approve'|'withdraw'}|null>(null);
  const [busy,setBusy]=useState(false);
  const attempt=useRef<{body:string;id:string}|null>(null);
  const inFlight=useRef(false);
  const reset=()=>{setPage(0);setEditing(null);setDecision(null);setError('');setNotice('');};

  useEffect(()=>{
    if(patient||search.trim().length<2){setResults([]);return;}
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch(`/api/praxis/search?q=${encodeURIComponent(search)}`,{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw new Error(tr('unavailable'));
        const data=await response.json();
        if(!controller.signal.aborted)setResults(data.results??[]);
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:tr('unavailable'));}
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[search,patient,locale]);

  useEffect(()=>{
    const controller=new AbortController();
    setItems([]);setHasMore(false);setWritable(false);setError('');
    if(kind==='service'&&!patient){setLoading(false);return;}
    setLoading(true);
    const query=new URLSearchParams({kind,page:String(page)});
    if(patient)query.set('patientId',patient.id);
    getData(query,locale,controller.signal).then(data=>{
      if(controller.signal.aborted)return;
      setItems(data.items);setHasMore(data.hasMore);setWritable(data.writable);setTariffs(data.tariffs??[]);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[kind,patient,page,refresh,locale]);

  async function mutate(command:Command){
    if(inFlight.current)return;
    const body=JSON.stringify(command);
    if(attempt.current?.body!==body)attempt.current={body,id:crypto.randomUUID()};
    inFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`/api/rechnungen/catalog?lang=${locale}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.current!.id},body});
      const data=await response.json();
      if(!response.ok){
        const issues=(data.issues??[]).map((code:string)=>t(`billing.issue.${code}`,locale));
        throw new Error([data.error||tr('unavailable'),...issues].join(' '));
      }
      attempt.current=null;setEditing(null);setDecision(null);setNotice(tr(command.action==='save'?'saved':'decided'));setRefresh(x=>x+1);
    }catch(e){setError(e instanceof Error?e.message:tr('unavailable'));}
    finally{inFlight.current=false;setBusy(false);}
  }

  return <section className={styles.root} data-theme={theme} aria-label={tr('workspace')}>
    <h2>{tr('workspace')}</h2><p className={styles.muted}>{tr('boundary')}</p>
    <div className={styles.row}>
      {(['service','tariff'] as const).map(k=><button key={k} disabled={busy||!!editing||!!decision} aria-pressed={kind===k} onClick={()=>{reset();setKind(k);}}>{tr(k)}</button>)}
    </div>
    {kind==='service'&&<div className={styles.search}>
      <label>{tr('patient')}<input value={patient?patient.name:search} disabled={busy||!!editing||!!decision} onChange={e=>{setPatient(null);setSearch(e.target.value);reset();}} placeholder={tr('patientSearch')}/></label>
      {patient&&<p className={styles.muted}>{patient.ivoris_nummer||patient.id}{patient.geburtsdatum?` · ${patient.geburtsdatum}`:''}</p>}
      {patient&&<Link href={`/rechnungen/behandlungskonto/${patient.id}`}>{t('treatment.open',locale)}</Link>}
      <div className={styles.results}>{results.map(p=><button key={p.id} onClick={()=>{setPatient(p);setResults([]);reset();}}>{p.name} · {p.ivoris_nummer||p.id}{p.geburtsdatum?` · ${p.geburtsdatum}`:''}</button>)}</div>
    </div>}
    {kind==='service'&&!patient&&<><QuarterOverview locale={locale} onOpen={selected=>{setPatient(selected);setSearch('');reset();}}/><WorkQueue locale={locale} onOpen={selected=>{setPatient(selected);setSearch('');reset();}}/></>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {kind==='tariff'&&writable&&!editing&&!decision&&<TariffImport locale={locale} onImported={()=>{setNotice(tr('tariffsImported'));setRefresh(x=>x+1);}}/>}
    {editing?<Editor key={editing.id+':'+editing.revision} editing={editing} patient={patient} locale={locale} busy={busy} onCancel={()=>setEditing(null)} onSave={mutate}/>
      :decision?<Decision key={decision.item.current.id+decision.action} {...decision} tariffs={tariffs} locale={locale} busy={busy} onCancel={()=>setDecision(null)} onSubmit={mutate}/>
      :<>
        {(kind==='tariff'||patient)&&<div className={`${styles.row} ${styles.spread} ${styles.panel}`}>
          <span className={styles.muted}>{tr('currentVersions')}</span>
          {writable&&<button className={styles.primary} onClick={()=>setEditing({id:crypto.randomUUID(),revision:0,kind})}>{tr(kind==='tariff'?'newTariff':'newService')}</button>}
        </div>}
        {loading?<p role="status">{tr('loading')}</p>:items.length===0&&(kind==='tariff'||patient)&&!error?<p>{tr('empty')}</p>:null}
        <ul className={styles.list}>{items.map(item=><li key={item.id}>
          <div className={`${styles.row} ${styles.spread}`}><strong>{String(item.current.data.schedule)} {String(item.current.data.code)}{item.current.data.description?` · ${item.current.data.description}`:''}</strong><span className={styles.badge}>{tr(item.current.state)} · v{item.head_version}</span></div>
          <p className={styles.muted}>{String(item.current.data.serviceDate??`${item.current.data.validFrom} – ${item.current.data.validTo}`)}{item.current.gross_cents!==null?` · ${tr('gross')}: ${money(item.current.gross_cents,locale)}`:''}</p>
          {!item.sourceCurrent&&<p className={styles.error}>{tr('stale')}</p>}
          <details><summary>{tr('details')}</summary><DataDetails data={item.current.data} locale={locale}/><History item={item} locale={locale}/></details>
          {writable&&<div className={styles.row}>
            <button onClick={()=>setEditing({id:item.id,revision:item.head_version,kind,data:item.current.data as Service|Tariff})}>{tr('revise')}</button>
            {item.current.state==='draft'&&<><button className={styles.primary} disabled={!item.sourceCurrent} onClick={()=>setDecision({item,action:'approve'})}>{tr('review')}</button><button className={styles.danger} onClick={()=>setDecision({item,action:'withdraw'})}>{tr('withdraw')}</button></>}
          </div>}
        </li>)}</ul>
        {(page>0||hasMore)&&<Pager page={page} more={hasMore} loading={loading} locale={locale} onChange={setPage}/>}
        {kind==='service'&&patient&&<PayerAllocation patient={patient} locale={locale} writable={writable}/>}
        {kind==='service'&&patient&&writable&&<Sources
          patient={patient}
          locale={locale}
          onPrepared={()=>{setNotice(tr('prepared'));setRefresh(x=>x+1);}}
          onSelect={candidate=>setEditing({id:crypto.randomUUID(),revision:0,kind:'service',data:{...candidate,schedule:candidate.schedule??'BEMA',insurerId:null,tariffVersionId:null} as Service})}
        />}
      </>}
  </section>;
}

type PayerLine={id:string;schedule:'BEMA'|'GOZ'|'LABOR'|'MATERIAL';code:string;description:string;serviceDate:string;grossCents:number};
type PayerVersion={id:string;revision:number;state:'draft'|'approved'|'withdrawn';payer_model:'private_full'|'statutory_share';patient_share_basis_points:1000|2000|10000;share_source_reference:string;expected_patient_cents:number;patient_cents:number|null;reason:string};
type IssuedInvoice={id:string;invoice_number:string;issue_date:string;due_date:string;total_cents:number;status:'preparing'|'issued'|'void';document_id:string;issued_at:string|null};
type InvoiceCancellation={id:string;cancellation_number:string;cancellation_date:string;reason:string;document_id:string};
export function PayerAllocation({patient,locale,writable}:{patient:Patient;locale:Locale;writable:boolean}){
  const initial=previousBillingQuarter(new Date()),tr=(key:string)=>t(`billing.work.${key}`,locale);
  const [period,setPeriod]=useState(initial),[caseId,setCaseId]=useState(''),[revision,setRevision]=useState(0),[current,setCurrent]=useState<PayerVersion|null>(null),[lines,setLines]=useState<PayerLine[]>([]);
  const [model,setModel]=useState<'private_full'|'statutory_share'>('private_full'),[share,setShare]=useState<1000|2000|10000>(10000),[expected,setExpected]=useState(''),[evidence,setEvidence]=useState(''),[reason,setReason]=useState('');
  const defaultDue=()=>{const value=new Date();value.setUTCDate(value.getUTCDate()+14);return value.toISOString().slice(0,10);};
  const [invoice,setInvoice]=useState<IssuedInvoice|null>(null),[dueDate,setDueDate]=useState(defaultDue),[invoiceReason,setInvoiceReason]=useState('');
  const [cancellation,setCancellation]=useState<InvoiceCancellation|null>(null),[cancelReason,setCancelReason]=useState(''),[cancelConfirmed,setCancelConfirmed]=useState(false);
  const [originalInvoice,setOriginalInvoice]=useState<{invoice_number:string;document_id:string}|null>(null);
  const [abandonment,setAbandonment]=useState<{reason:string;created_at:string}|null>(null);
  const cancelAttempt=useRef<{body:string;id:string}|null>(null),cancelInFlight=useRef(false);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[refresh,setRefresh]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setNotice('');
    getData(new URLSearchParams({kind:'payer',patientId:patient.id,from:period.from,to:period.to,page:'0'}),locale,controller.signal).then(data=>{
      if(controller.signal.aborted)return;
      setCaseId(data.caseId);setRevision(data.payerCase?.head_version??0);setLines(data.lines??[]);setCurrent(data.current??null);setInvoice(data.invoice??null);setCancellation(data.cancellation??null);setOriginalInvoice(data.originalInvoice??null);setAbandonment(data.abandonment??null);setCancelReason('');setCancelConfirmed(false);
      if(data.current){setModel(data.current.payer_model);setShare(data.current.patient_share_basis_points);setExpected((data.current.expected_patient_cents/100).toFixed(2));setEvidence(data.current.share_source_reference);setReason('');}
      else{setModel('private_full');setShare(10000);setExpected('');setEvidence('');setReason('');}
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[patient.id,period,locale,refresh]);
  const gross=lines.reduce((sum,line)=>sum+Number(line.grossCents??0),0);
  const calculated=Math.round(gross*share/10000);
  async function send(action:'save_payer'|'approve_payer'|'withdraw_payer'){
    setBusy(true);setError('');setNotice('');
    try{
      const parsedExpected=Math.round(Number(expected.replace(',','.'))*100);
      const body=action==='save_payer'?{action,caseId,expectedRevision:revision,reason,data:{patientId:patient.id,from:period.from,to:period.to,serviceVersionIds:lines.map(line=>line.id),payerModel:model,patientShareBasisPoints:share,shareSourceReference:evidence,expectedPatientCents:parsedExpected}}:{action,versionId:current!.id,reason};
      const response=await fetch(`/api/rechnungen/catalog?lang=${locale}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});
      const data=await response.json();if(!response.ok)throw new Error(data.error||tr('unavailable'));
      setNotice(tr(action==='save_payer'?'payerSaved':'payerDecided'));setRefresh(value=>value+1);
    }catch(e){setError(e instanceof Error?e.message:tr('unavailable'));}finally{setBusy(false);}
  }
  async function issue(){
    if(!current)return;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`/api/rechnungen/catalog?lang=${locale}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({action:'issue_invoice',payerVersionId:current.id,dueDate,reason:invoiceReason})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||tr('unavailable'));
      setNotice(tr('invoiceIssued'));setInvoiceReason('');setRefresh(value=>value+1);
    }catch(e){setError(e instanceof Error?e.message:tr('unavailable'));}finally{setBusy(false);}
  }
  async function cancel(){
    if(!invoice||!cancelConfirmed||cancelInFlight.current)return;
    const body=JSON.stringify({action:invoice.status==='preparing'?'abandon_invoice':'cancel_invoice',invoiceId:invoice.id,reason:cancelReason.trim()});
    if(cancelAttempt.current?.body!==body)cancelAttempt.current={body,id:crypto.randomUUID()};
    cancelInFlight.current=true;setBusy(true);setError('');setNotice('');
    try{
      const response=await fetch(`/api/rechnungen/catalog?lang=${locale}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':cancelAttempt.current.id},body});
      const data=await response.json();if(!response.ok)throw new Error(data.error||tr('unavailable'));
      cancelAttempt.current=null;setRefresh(value=>value+1);
    }catch(e){setError(e instanceof Error?e.message:tr('unavailable'));}
    finally{cancelInFlight.current=false;setBusy(false);}
  }
  return <section className={`${styles.panel} ${styles.quarter}`} aria-labelledby="payer-allocation-title">
    <div className={`${styles.row} ${styles.spread}`}><div><h3 id="payer-allocation-title">{tr('payerTitle')}</h3><p className={styles.muted}>{tr('payerIntro')}</p></div><div className={styles.row}>{(['from','to'] as const).map(key=><label key={key}>{t(`billing.${key}`,locale)}<input type="date" disabled={busy} value={period[key]} onChange={event=>setPeriod({...period,[key]:event.target.value})}/></label>)}</div></div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
    {!loading&&invoice&&<div>
      <h4>{tr(invoice.status==='preparing'?'invoicePreparing':invoice.status==='void'?(invoice.issued_at?'invoiceCancelled':'invoiceAbandoned'):'invoiceIssued')}</h4>
      <p>{invoice.invoice_number} · {money(invoice.total_cents,locale)}</p>
      {invoice.issued_at&&<a href={`/api/patient/dokumente/${invoice.document_id}/datei?lang=${locale}`} target="_blank" rel="noreferrer">{tr('invoiceOpen')}</a>}
      {originalInvoice&&<p>{tr('correctionOriginal')}: <a href={`/api/patient/dokumente/${originalInvoice.document_id}/datei?lang=${locale}`} target="_blank" rel="noreferrer">{originalInvoice.invoice_number}</a></p>}
      {cancellation&&<><p>{cancellation.cancellation_number} · {cancellation.cancellation_date}</p><p>{cancellation.reason}</p><a href={`/api/patient/dokumente/${cancellation.document_id}/datei?lang=${locale}`} target="_blank" rel="noreferrer">{tr('cancellationOpen')}</a><p className={styles.muted}>{tr('correctionNext')}</p></>}
      {abandonment&&<><p>{abandonment.reason}</p><p className={styles.muted}>{tr('abandonmentNext')}</p></>}
      {writable&&(invoice.status==='issued'||invoice.status==='preparing')&&<details><summary>{tr(invoice.status==='preparing'?'abandonmentTitle':'cancellationTitle')}</summary>
        <p className={styles.muted}>{tr(invoice.status==='preparing'?'abandonmentImpact':'cancellationImpact')}</p>
        <label>{tr(invoice.status==='preparing'?'abandonmentReason':'cancellationReason')}<textarea maxLength={1000} disabled={busy} value={cancelReason} onChange={event=>{setCancelReason(event.target.value);setCancelConfirmed(false);}}/></label>
        <label className={styles.check}><input type="checkbox" disabled={busy} checked={cancelConfirmed} onChange={event=>setCancelConfirmed(event.target.checked)}/>{tr(invoice.status==='preparing'?'abandonmentConfirm':'cancellationConfirm')}</label>
        <button className={styles.danger} disabled={busy||!cancelConfirmed||cancelReason.trim().length<3} onClick={()=>void cancel()}>{tr(busy?'cancellationWorking':invoice.status==='preparing'?'abandonmentSubmit':'cancellationSubmit')}</button>
      </details>}
    </div>}
    {loading?<p role="status">{tr('loading')}</p>:lines.length===0?<p>{tr('noApprovedServices')}</p>:<>
      <div className={styles.statGrid}><div className={`${styles.stat} ${styles.neutral}`}><strong>{lines.length}</strong><span>{tr('approvedPositions')}</span></div><div className={`${styles.stat} ${styles.neutral}`}><strong>{money(gross,locale)}</strong><span>{tr('approvedGross')}</span></div><div className={`${styles.stat} ${current?.state==='approved'?styles.good:styles.warn}`}><strong>{current?tr(`payer${current.state[0].toUpperCase()}${current.state.slice(1)}`):tr('payerDraft')}</strong><span>{tr('payerTitle')}</span></div></div>
      {current?.state==='approved'&&invoice?.status!=='void'?<><p className={styles.notice}>{tr('payerApproved')}: {money(current.patient_cents??current.expected_patient_cents,locale)}</p>
        {invoice?.status!=='issued'&&writable&&<div className={styles.grid}><label>{tr('invoiceDueDate')}<input type="date" value={dueDate} min={new Date().toISOString().slice(0,10)} onChange={event=>setDueDate(event.target.value)}/></label><label>{tr('invoiceReason')}<textarea value={invoiceReason} onChange={event=>setInvoiceReason(event.target.value)}/></label><button className={styles.primary} disabled={busy||invoiceReason.trim().length<3||!dueDate} onClick={()=>void issue()}>{tr(invoice?.status==='preparing'?'invoiceResume':'invoiceIssue')}</button></div>}</>
        :writable&&<div className={styles.grid}>
        <label>{tr('patientShare')}<select value={model} onChange={event=>{const value=event.target.value as typeof model;setModel(value);setShare(value==='private_full'?10000:2000);}}><option value="private_full">{tr('payerPrivate')}</option><option value="statutory_share">{tr('payerStatutory')}</option></select></label>
        {model==='statutory_share'&&<label>{tr('patientShare')}<select value={share} onChange={event=>setShare(Number(event.target.value) as 1000|2000)}><option value={1000}>10 %</option><option value={2000}>20 %</option></select></label>}
        <label>{tr('expectedPatientAmount')}<input inputMode="decimal" value={expected} onChange={event=>setExpected(event.target.value)} placeholder={(calculated/100).toFixed(2)}/></label>
        <label>{tr('shareEvidence')}<input value={evidence} onChange={event=>setEvidence(event.target.value)} /></label>
        <label>{tr('reason')}<textarea value={reason} onChange={event=>setReason(event.target.value)} /></label>
        <div className={styles.row}>{(!current||current.state!=='draft')&&<button className={styles.primary} disabled={busy||reason.trim().length<3||evidence.trim().length<3||!Number.isFinite(Number(expected.replace(',','.')))} onClick={()=>void send('save_payer')}>{tr('payerSave')}</button>}{current?.state==='draft'&&<><button className={styles.primary} disabled={busy||reason.trim().length<3} onClick={()=>void send('approve_payer')}>{tr('payerApprove')}</button><button className={styles.danger} disabled={busy||reason.trim().length<3} onClick={()=>void send('withdraw_payer')}>{tr('payerWithdraw')}</button></>}</div>
      </div>}
    </>}
    <InvoiceHistory key={`${patient.id}:${period.from}:${period.to}`} patientId={patient.id} period={period} locale={locale} refresh={refresh} writable={writable} onChanged={()=>setRefresh(value=>value+1)}/>
  </section>;
}

function InvoiceHistory({patientId,period,locale,refresh,writable,onChanged}:{patientId:string;period:{from:string;to:string};locale:Locale;refresh:number;writable:boolean;onChanged:()=>void}){
  type HistoryInvoice=IssuedInvoice&{created_at:string;void_reason:string|null;cancellationDocumentId:string|null};
  const tr=(key:string)=>t(`billing.work.${key}`,locale);
  const [page,setPage]=useState(0),[items,setItems]=useState<HistoryInvoice[]>([]),[hasMore,setHasMore]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const [selected,setSelected]=useState<HistoryInvoice|null>(null),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
  const attempt=useRef<{body:string;id:string}|null>(null),inFlight=useRef(false);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    getData(new URLSearchParams({kind:'invoice_history',patientId,from:period.from,to:period.to,page:String(page)}),locale,controller.signal)
      .then(data=>{if(!controller.signal.aborted){setItems(data.items);setHasMore(data.hasMore);}})
      .catch(e=>{if(!controller.signal.aborted){setItems([]);setHasMore(false);setError(e.message);}})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[patientId,period.from,period.to,locale,page,refresh]);
  async function abandon(){
    if(!selected||!confirmed||inFlight.current)return;
    const body=JSON.stringify({action:'abandon_invoice',invoiceId:selected.id,reason:reason.trim()});
    if(attempt.current?.body!==body)attempt.current={body,id:crypto.randomUUID()};
    inFlight.current=true;setBusy(true);setError('');
    try{
      const response=await fetch(`/api/rechnungen/catalog?lang=${locale}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':attempt.current.id},body});
      const data=await response.json();if(!response.ok)throw new Error(data.error||tr('unavailable'));
      attempt.current=null;setSelected(null);setReason('');setConfirmed(false);onChanged();
    }catch(e){setError(e instanceof Error?e.message:tr('unavailable'));}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <details className={styles.panel}><summary>{tr('invoiceHistory')}</summary>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {loading?<p role="status">{tr('loading')}</p>:(!error||items.length>0)&&<>
      {items.length===0?<p>{tr('invoiceHistoryEmpty')}</p>:<ul className={styles.list}>{items.map(item=><li key={item.id}>
        <strong>{item.invoice_number} · {money(item.total_cents,locale)}</strong>
        <p>{tr(item.status==='preparing'?'invoicePreparing':item.status==='void'?(item.issued_at?'invoiceCancelled':'invoiceAbandoned'):'invoiceIssued')}</p>
        <p className={styles.muted}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Berlin'}).format(new Date(item.created_at))}</p>
        {item.void_reason&&<p>{item.void_reason}</p>}
        <div className={styles.row}>{item.issued_at&&<a href={`/api/patient/dokumente/${item.document_id}/datei?lang=${locale}`} target="_blank" rel="noreferrer">{tr('invoiceOpen')}</a>}
        {item.cancellationDocumentId&&<a href={`/api/patient/dokumente/${item.cancellationDocumentId}/datei?lang=${locale}`} target="_blank" rel="noreferrer">{tr('cancellationOpen')}</a>}</div>
        {writable&&item.status==='preparing'&&<button disabled={busy} onClick={()=>{setSelected(item);setReason('');setConfirmed(false);}}>{tr('abandonmentTitle')}</button>}
      </li>)}</ul>}
      {selected&&<div className={styles.panel}><h4>{tr('abandonmentTitle')}: {selected.invoice_number}</h4><p>{tr('abandonmentImpact')}</p>
        <label>{tr('abandonmentReason')}<textarea maxLength={1000} disabled={busy} value={reason} onChange={event=>{setReason(event.target.value);setConfirmed(false);}}/></label>
        <label className={styles.check}><input type="checkbox" disabled={busy} checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{tr('abandonmentConfirm')}</label>
        <div className={styles.row}><button className={styles.danger} disabled={busy||!confirmed||reason.trim().length<3} onClick={()=>void abandon()}>{tr('abandonmentSubmit')}</button>
        <button disabled={busy} onClick={()=>setSelected(null)}>{tr('cancel')}</button></div>
      </div>}
      <div className={styles.row}><button disabled={busy||page===0} onClick={()=>{setSelected(null);setPage(value=>value-1);}}>{tr('previous')}</button><span>{page+1}</span><button disabled={busy||!hasMore} onClick={()=>{setSelected(null);setPage(value=>value+1);}}>{tr('next')}</button></div>
    </>}
  </details>;
}

function QuarterOverview({locale,onOpen}:{locale:Locale;onOpen:(patient:Patient)=>void}){
  const initial=previousBillingQuarter(new Date());
  const [period,setPeriod]=useState(initial),[page,setPage]=useState(0),[summary,setSummary]=useState<QuarterSummary|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const tr=(key:string)=>t(`billing.work.${key}`,locale);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    getData(new URLSearchParams({kind:'quarter',from:period.from,to:period.to,page:String(page)}),locale,controller.signal).then(data=>{if(!controller.signal.aborted)setSummary(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[period,page,locale]);
  const stats=summary?[
    ['readyPatients',summary.readyPatients,'good'],['blockedPatients',summary.blockedPatients,'bad'],['approvedPositions',summary.approvedPositions,'good'],['draftPositions',summary.draftPositions,'warn'],['missingPositions',summary.missingPositions,'bad'],['incompletePositions',summary.incompletePositions,'bad'],['stalePositions',summary.stalePositions,'bad'],['approvedGross',money(summary.approvedGrossCents,locale),'neutral'],
  ] as const:[];
  return <section className={`${styles.panel} ${styles.quarter}`} aria-labelledby="billing-quarter-title">
    <div className={`${styles.row} ${styles.spread}`}><div><h3 id="billing-quarter-title">{tr('quarterTitle')}</h3><p className={styles.muted}>{tr('quarterIntro')}</p></div><div className={styles.row}>{(['from','to'] as const).map(key=><label key={key}>{t(`billing.${key}`,locale)}<input type="date" value={period[key]} onChange={event=>{setPeriod({...period,[key]:event.target.value});setPage(0);}}/></label>)}</div></div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {loading?<p role="status">{tr('loading')}</p>:summary&&<><div className={styles.statGrid}>{stats.map(([key,value,tone])=><div className={`${styles.stat} ${styles[tone]}`} key={key}><strong>{value}</strong><span>{tr(key)}</span></div>)}</div><p className={styles.muted}>{summary.confirmedEntries} {tr('confirmedEntries')} · {summary.sourcePositions} {tr('sourcePositions')} · {summary.entriesWithoutPositions} {tr('entriesWithoutPositions')}</p><h3>{tr('quarterCases')}</h3><ul className={styles.queueList}>{summary.cases.map(item=><li key={item.patientId}><div><strong>{item.patient.name}</strong><p className={styles.muted}>{item.patient.ivoris_nummer||tr('missingPatientNumber')}</p></div><div><span className={`${styles.status} ${item.ready?styles.approved:styles.needs_data}`}>{tr(item.ready?'queue_approved':'quarterNeedsWork')}</span><p className={styles.muted}>{item.approved}/{item.positions} {tr('positionsRecorded')} · {[item.missing&&`${item.missing} ${tr('missingShort')}`,item.incomplete&&`${item.incomplete} ${tr('incompleteShort')}`,item.draft&&`${item.draft} ${tr('draftShort')}`,item.withdrawn&&`${item.withdrawn} ${tr('withdrawnShort')}`,item.stale&&`${item.stale} ${tr('staleShort')}`,item.emptyEntries&&`${item.emptyEntries} ${tr('emptyShort')}`].filter(Boolean).join(' · ')||tr('complete')}</p></div><button className={item.ready?undefined:styles.primary} onClick={()=>onOpen(item.patient)}>{tr(item.ready?'viewCase':'openCase')}</button></li>)}</ul>{(page>0||summary.caseHasMore)&&<Pager page={page} more={summary.caseHasMore} loading={loading} locale={locale} onChange={setPage}/>}</>}
  </section>;
}

function TariffImport({locale,onImported}:{locale:Locale;onImported:()=>void}){
  const [tariffs,setTariffs]=useState<unknown[]>([]),[errors,setErrors]=useState<string[]>([]),[busy,setBusy]=useState(false),[result,setResult]=useState('');
  const tr=(key:string)=>t(`billing.work.${key}`,locale);
  async function read(file:File|undefined){
    setTariffs([]);setErrors([]);setResult('');if(!file)return;
    const parsed=parseTariffImport(await file.text());
    if(!parsed.ok){setErrors(parsed.errors);return;}setTariffs(parsed.tariffs);
  }
  function downloadTemplate(){
    const url=URL.createObjectURL(new Blob([tariffImportTemplate()],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='anima-cura-tarifimport-vorlage.csv';link.click();URL.revokeObjectURL(url);
  }
  async function submit(){
    setBusy(true);setErrors([]);setResult('');
    try{
      const response=await fetch(`/api/rechnungen/catalog?lang=${locale}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({action:'import_tariffs',tariffs})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||tr('unavailable'));
      setResult(tr('tariffImportResult').replace('{created}',String(data.created)).replace('{revised}',String(data.revised)).replace('{unchanged}',String(data.unchanged)));onImported();
    }catch(error){setErrors([error instanceof Error?error.message:tr('unavailable')]);}finally{setBusy(false);}
  }
  return <details className={styles.panel}><summary>{tr('tariffImportTitle')}</summary><p className={styles.muted}>{tr('tariffImportHint')}</p><div className={styles.row}><button type="button" onClick={downloadTemplate}>{tr('downloadTemplate')}</button><label className={styles.fileLabel}>{tr('selectCsv')}<input type="file" accept=".csv,text/csv" onChange={event=>void read(event.target.files?.[0])}/></label></div>{errors.length>0&&<p role="alert" className={styles.error}>{tr('tariffImportInvalid')} {errors.slice(0,5).join(', ')}</p>}{tariffs.length>0&&<div className={`${styles.row} ${styles.panel}`}><strong>{tariffs.length} {tr('tariffRowsReady')}</strong><button className={styles.primary} disabled={busy} onClick={()=>void submit()}>{tr(busy?'importingTariffs':'importTariffs')}</button></div>}{result&&<p role="status" className={styles.notice}>{result}</p>}</details>;
}

function WorkQueue({locale,onOpen}:{locale:Locale;onOpen:(patient:Patient)=>void}){
  const tr=(key:string)=>t(`billing.work.${key}`,locale);
  const [page,setPage]=useState(0),[cases,setCases]=useState<QueueCase[]>([]),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    getData(new URLSearchParams({kind:'queue',page:String(page)}),locale,controller.signal).then(data=>{if(!controller.signal.aborted){setCases(data.cases??[]);setMore(data.hasMore);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[page,locale]);
  return <section className={`${styles.panel} ${styles.queue}`} aria-labelledby="billing-queue-title">
    <div className={`${styles.row} ${styles.spread}`}><div><h3 id="billing-queue-title">{tr('queueTitle')}</h3><p className={styles.muted}>{tr('queueIntro')}</p></div><span className={styles.badge}>{tr('queuePage')} {page+1}</span></div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {loading?<p role="status">{tr('loading')}</p>:cases.length===0?<p>{tr('queueEmpty')}</p>:<ul className={styles.queueList}>{cases.map(item=><li key={item.sourceId}>
      <div><strong>{item.patient.name}</strong><p className={styles.muted}>{item.serviceDate} · {item.patient.ivoris_nummer||tr('missingPatientNumber')}</p></div>
      <div><span className={`${styles.status} ${styles[item.status]}`}>{tr(`queue_${item.status}`)}</span><p className={styles.muted}>{item.recordedPositions}/{item.totalPositions} {tr('positionsRecorded')}{item.incompletePositions?` · ${item.incompletePositions} ${tr('positionsIncomplete')}`:''}</p></div>
      <button className={item.status==='approved'?undefined:styles.primary} onClick={()=>onOpen(item.patient)}>{tr(item.status==='approved'?'viewCase':'openCase')}</button>
    </li>)}</ul>}
    {(page>0||more)&&<Pager page={page} more={more} loading={loading} locale={locale} onChange={setPage}/>}
  </section>;
}

function money(cents:number,locale:Locale){return new Intl.NumberFormat(locale==='de'?'de-DE':'en-GB',{style:'currency',currency:'EUR'}).format(cents/100);}
function Pager({page,more,loading,locale,onChange}:{page:number;more:boolean;loading:boolean;locale:Locale;onChange:(p:number)=>void}){
  return <div className={styles.row}><button disabled={loading||page===0} onClick={()=>onChange(page-1)}>{t('billing.work.previous',locale)}</button><span>{t('billing.work.page',locale)} {page+1}</span><button disabled={loading||!more} onClick={()=>onChange(page+1)}>{t('billing.work.next',locale)}</button></div>;
}

function DataDetails({data,locale}:{data:Record<string,unknown>;locale:Locale}){
  return <dl>{Object.entries(data).map(([key,value])=><div key={key} style={{display:'contents'}}><dt>{t(`billing.work.${key}`,locale)}</dt><dd>{value==null?t('billing.work.missing',locale):typeof value==='boolean'?t(`billing.work.${value?'yes':'no'}`,locale):typeof value==='object'?<DataDetails data={value as Record<string,unknown>} locale={locale}/>:String(value)}</dd></div>)}</dl>;
}

function History({item,locale}:{item:Item;locale:Locale}){
  const [page,setPage]=useState(0),[versions,setVersions]=useState<BillingVersion[]>([]),[more,setMore]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false),[open,setOpen]=useState(false);
  useEffect(()=>{
    if(!open)return;const controller=new AbortController();setLoading(true);setError('');setVersions([]);
    getData(new URLSearchParams({kind:item.kind,history:item.id,page:String(page)}),locale,controller.signal).then(d=>{if(!controller.signal.aborted){setVersions(d.versions);setMore(d.hasMore);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[open,page,item.id,item.head_version,locale]);
  return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t('billing.work.history',locale)}</summary>{error&&<p role="alert">{error}</p>}{loading&&<p>{t('billing.work.loading',locale)}</p>}<ul className={styles.list}>{versions.map(v=><li key={v.id}><strong>v{v.revision} · {t(`billing.work.${v.state}`,locale)}</strong><p>{v.reason}</p><p className={styles.muted}>{v.created_at} · {v.created_by}</p>{v.decided_at&&<p>{v.decision_reason} · {v.decided_at} · {v.decided_by}</p>}<details><summary>{t('billing.work.details',locale)}</summary><DataDetails data={v.data} locale={locale}/></details></li>)}</ul><Pager page={page} more={more} loading={loading} locale={locale} onChange={setPage}/></details>;
}

function Sources({patient,locale,onSelect,onPrepared}:{patient:Patient;locale:Locale;onSelect:(c:Candidate)=>void;onPrepared:()=>void}){
  const [period,setPeriod]=useState(previousBillingQuarter),[page,setPage]=useState(0),[lines,setLines]=useState<Candidate[]>([]),[missing,setMissing]=useState(0),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
  const [preparing,setPreparing]=useState(false),[result,setResult]=useState('');
  useEffect(()=>{
    setLines([]);setMore(false);setMissing(0);if(!open)return;
    const controller=new AbortController();setLoading(true);setError('');
    getData(new URLSearchParams({kind:'source',patientId:patient.id,...period,page:String(page)}),locale,controller.signal).then(d=>{if(!controller.signal.aborted){setLines(d.lines);setMissing(d.entriesWithoutPositions);setMore(d.hasMore);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[patient.id,period,page,open,locale]);
  async function prepareAll(){
    const sourceIds=Array.from(new Set(lines.map(line=>line.source.recordId)));
    setPreparing(true);setError('');setResult('');
    try{
      const totals={prepared:0,blocked:0,skippedExisting:0};
      for(const sourceId of sourceIds){
        const response=await fetch(`/api/rechnungen/catalog?lang=${locale}`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({action:'prepare_source',sourceId})});
        const data=await response.json();if(!response.ok)throw new Error(data.error||t('billing.work.unavailable',locale));
        totals.prepared+=data.prepared;totals.blocked+=data.blocked;totals.skippedExisting+=data.skippedExisting;
      }
      setResult(t('billing.work.prepareResult',locale).replace('{prepared}',String(totals.prepared)).replace('{blocked}',String(totals.blocked)).replace('{existing}',String(totals.skippedExisting)));onPrepared();
    }catch(e){setError(e instanceof Error?e.message:t('billing.work.unavailable',locale));}finally{setPreparing(false);}
  }
  return <details className={styles.panel} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t('billing.work.sources',locale)}</summary><p className={styles.muted}>{t('billing.sourceScope',locale)}</p><div className={styles.grid}>{(['from','to'] as const).map(k=><label key={k}>{t(`billing.${k}`,locale)}<input type="date" value={period[k]} onChange={e=>{setPeriod({...period,[k]:e.target.value});setPage(0);}}/></label>)}</div>{error&&<p role="alert" className={styles.error}>{error}</p>}{result&&<p role="status" className={styles.notice}>{result}</p>}{loading&&<p role="status">{t('billing.work.loading',locale)}</p>}{missing>0&&<p>{t('billing.emptyEntries',locale)}: {missing}</p>}{!loading&&!error&&lines.length===0&&<p>{t('billing.work.emptySources',locale)}</p>}{lines.length>0&&<div className={styles.row}><button className={styles.primary} disabled={preparing||loading} onClick={prepareAll}>{t(preparing?'billing.work.preparing':'billing.work.prepareAll',locale)}</button><span className={styles.muted}>{t('billing.work.prepareHint',locale)}</span></div>}<ul className={styles.list}>{lines.map(c=><li key={c.source.recordId+':'+c.source.positionIndex}><strong>{c.schedule} {c.code} · {c.description}</strong><p>{c.serviceDate} · {t('billing.work.quantity',locale)}: {c.quantity??t('billing.work.missing',locale)}</p><button disabled={!c.schedule} onClick={()=>onSelect(c)}>{t('billing.work.useSource',locale)}</button>{!c.schedule&&<p>{t('billing.issue.invalid_schedule',locale)}</p>}</li>)}</ul><Pager page={page} more={more} loading={loading} locale={locale} onChange={setPage}/></details>;
}

function Editor({editing,patient,locale,busy,onCancel,onSave}:{editing:Editing;patient:Patient|null;locale:Locale;busy:boolean;onCancel:()=>void;onSave:(c:Command)=>Promise<void>}){
  const tr=(key:string)=>t(`billing.work.${key}`,locale);
  const initial=editing.data as Service&Tariff|undefined;
  const [fields,setFields]=useState<Record<string,string>>({schedule:initial?.schedule??'',code:initial?.code??'',description:initial?.description??'',serviceDate:initial?.serviceDate??'',quantity:initial?.quantity?.toString()??'',region:initial?.region??'',factor:initial?.factor??'',justification:initial?.justification??'',insurerId:initial?.insurerId??'',tariffVersionId:initial?.tariffVersionId??'',sourceReference:initial?.sourceReference??'',validFrom:initial?.validFrom??'',validTo:initial?.validTo??'',priceKind:initial?.price?.kind??'points',points:initial?.price?.kind==='points'?initial.price.points:'',pointValueEuro:initial?.price?.kind==='points'?initial.price.pointValueEuro:'',unitPriceEuro:initial?.price?.kind==='unit'?initial.price.unitPriceEuro:'',recordId:initial?.source?.recordId??'',version:initial?.source?.version?.toString()??'1',positionIndex:initial?.source?.positionIndex?.toString()??'0'});
  const [requiresRegion,setRequiresRegion]=useState(initial?.requiresRegion??false),[reason,setReason]=useState(''),[error,setError]=useState('');
  const [tariffs,setTariffs]=useState<BillingVersion[]>([]),[tariffError,setTariffError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{
    if(editing.kind!=='service')return;const controller=new AbortController();setLoading(true);
    (async()=>{
      const collected:BillingVersion[]=[];
      for(let p=0;p<80;p++){
        const data=await getData(new URLSearchParams({kind:'tariff',page:String(p)}),locale,controller.signal);
        collected.push(...data.items.filter((i:Item)=>i.current.state==='approved').map((i:Item)=>i.current));
        if(!data.hasMore){if(!controller.signal.aborted)setTariffs(collected);return;}
      }
      throw new Error(tr('catalogLimit'));
    })().catch(e=>{if(!controller.signal.aborted)setTariffError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[editing.kind,locale]);
  const set=(key:string,value:string)=>setFields(f=>({...f,[key]:value}));
  const field=(key:string,type='text',required=false,disabled=false)=><label key={key}>{tr(key)}<input type={type} value={fields[key]} required={required} disabled={disabled} min={type==='number'?(key==='positionIndex'?0:1):undefined} step={type==='number'?1:undefined} onChange={e=>set(key,e.target.value)} inputMode={['points','pointValueEuro','unitPriceEuro','factor'].includes(key)?'decimal':undefined}/></label>;
  const dec=(key:string)=>fields[key].trim().replace(',','.');
  async function submit(e:React.FormEvent){
    e.preventDefault();setError('');
    const data=editing.kind==='tariff'?{schedule:fields.schedule,code:fields.code,sourceReference:fields.sourceReference,validFrom:fields.validFrom,validTo:fields.validTo,insurerId:fields.insurerId||null,requiresRegion,price:fields.priceKind==='points'?{kind:'points',points:dec('points'),pointValueEuro:dec('pointValueEuro')}:{kind:'unit',unitPriceEuro:dec('unitPriceEuro')}}
      :{patientId:patient!.id,serviceDate:fields.serviceDate,schedule:fields.schedule,code:fields.code,description:fields.description,quantity:fields.quantity?Number(fields.quantity):null,region:fields.region||null,factor:fields.factor?dec('factor'):null,justification:fields.justification||null,insurerId:fields.insurerId||null,tariffVersionId:fields.tariffVersionId||null,source:{system:initial?.source?.system??'manual',recordId:fields.recordId,version:Number(fields.version),positionIndex:Number(fields.positionIndex)}};
    const parsed=workspaceCommand.safeParse({action:'save',kind:editing.kind,recordId:editing.id,expectedRevision:editing.revision,reason,data});
    if(!parsed.success){setError(tr('invalid'));return;}
    await onSave(parsed.data);
  }
  return <form className={styles.panel} onSubmit={submit}><h3>{tr(editing.revision?'revise':editing.kind==='tariff'?'newTariff':'newService')}</h3><p className={styles.muted}>{tr('draftHint')}</p>{error&&<p role="alert" className={styles.error}>{error}</p>}<fieldset disabled={busy}><div className={styles.grid}>
    <label>{tr('schedule')}<select required value={fields.schedule} onChange={e=>set('schedule',e.target.value)}><option value="">{tr('choose')}</option>{schedules.map(s=><option key={s}>{s}</option>)}</select></label>{field('code','text',true)}
    {editing.kind==='tariff'?<>{field('sourceReference','text',true)}{field('insurerId','text',fields.schedule==='BEMA')}{field('validFrom','date',true)}{field('validTo','date',true)}<label>{tr('priceKind')}<select value={fields.priceKind} onChange={e=>set('priceKind',e.target.value)}><option value="points">{tr('pointPrice')}</option><option value="unit">{tr('unitPrice')}</option></select></label>{fields.priceKind==='points'?<>{field('points','text',true)}{field('pointValueEuro','text',true)}</>:field('unitPriceEuro','text',true)}<label className={styles.check}><input type="checkbox" checked={requiresRegion} onChange={e=>setRequiresRegion(e.target.checked)}/>{tr('requiresRegion')}</label></>
      :<>{field('serviceDate','date',true)}{field('description','text',true)}{field('quantity','number')}{field('region')}{field('factor')}{field('insurerId')}<label className={styles.full}>{tr('tariffVersionId')}<select value={fields.tariffVersionId} disabled={loading||!!tariffError} onChange={e=>set('tariffVersionId',e.target.value)}><option value="">{tr('missingTariff')}</option>{fields.tariffVersionId&&!tariffs.some(v=>v.id===fields.tariffVersionId)&&<option value={fields.tariffVersionId}>{tr('pinnedTariff')} · {fields.tariffVersionId}</option>}{tariffs.map(v=><option key={v.id} value={v.id}>{String(v.data.schedule)} {String(v.data.code)} · {String(v.data.insurerId??'—')} · {String(v.data.validFrom)} – {String(v.data.validTo)} · v{v.revision}</option>)}</select></label>{tariffError&&<p role="alert">{tariffError}</p>}<label className={styles.full}>{tr('justification')}<textarea value={fields.justification} onChange={e=>set('justification',e.target.value)}/></label><details className={styles.full} open={!initial?.source}><summary>{tr('source')}</summary><div className={styles.grid}>{field('recordId','text',true,!!initial?.source)}{field('version','number',true,initial?.source?.system==='scribe')}{field('positionIndex','number',true,!!initial?.source)}</div></details></>}
    <label className={styles.full}>{tr('reason')}<textarea required minLength={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
  </div><div className={`${styles.row} ${styles.panel}`}><button className={styles.primary} type="submit">{tr(busy?'saving':'save')}</button><button type="button" onClick={onCancel}>{tr('cancel')}</button></div></fieldset></form>;
}

function Decision({item,action,tariffs,locale,busy,onCancel,onSubmit}:{item:Item;action:'approve'|'withdraw';tariffs:BillingVersion[];locale:Locale;busy:boolean;onCancel:()=>void;onSubmit:(c:Command)=>Promise<void>}){
  const tr=(key:string)=>t(`billing.work.${key}`,locale);
  const [reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false);
  const review=item.kind==='service'?reviewService(item.current.data,tariffs.find(v=>v.id===item.current.tariff_version_id)??null,'preview',new Date().toISOString()):null;
  const blocked=action==='approve'&&(review&&!review.ok||!item.sourceCurrent);
  return <form className={styles.panel} onSubmit={e=>{e.preventDefault();if(!confirmed||blocked)return;void onSubmit({action,versionId:item.current.id,reason});}}><h3>{tr(action==='approve'?'review':'withdraw')} · {String(item.current.data.code)} · v{item.head_version}</h3><DataDetails data={item.current.data} locale={locale}/>{review?.grossCents!=null&&<p><strong>{tr('gross')}: {money(review.grossCents,locale)}</strong></p>}{review&&!review.ok&&action==='approve'&&<ul className={styles.error}>{review.issues.map(i=><li key={i}>{t(`billing.issue.${i}`,locale)}</li>)}</ul>}<p className={styles.muted}>{tr('boundary')}</p><fieldset disabled={busy}><label>{tr('reason')}<textarea value={reason} onChange={e=>setReason(e.target.value)} required minLength={3} maxLength={1000}/></label><p><label className={styles.check}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{tr(action==='approve'?'confirmApproval':'confirmWithdrawal')}</label></p><div className={styles.row}><button className={styles.primary} disabled={!confirmed||!!blocked} type="submit">{tr(busy?'saving':action==='approve'?'approve':'withdraw')}</button><button type="button" onClick={onCancel}>{tr('cancel')}</button></div></fieldset></form>;
}
