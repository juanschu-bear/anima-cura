"use client";

import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { t } from '@/lib/i18n';
import { previousBillingQuarter } from '@/lib/billing-readiness';
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
      <div className={styles.results}>{results.map(p=><button key={p.id} onClick={()=>{setPatient(p);setResults([]);reset();}}>{p.name} · {p.ivoris_nummer||p.id}{p.geburtsdatum?` · ${p.geburtsdatum}`:''}</button>)}</div>
    </div>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
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
        {kind==='service'&&patient&&writable&&<Sources patient={patient} locale={locale} onSelect={candidate=>setEditing({id:crypto.randomUUID(),revision:0,kind:'service',data:{...candidate,schedule:candidate.schedule??'BEMA',insurerId:null,tariffVersionId:null} as Service})}/>}
      </>}
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

function Sources({patient,locale,onSelect}:{patient:Patient;locale:Locale;onSelect:(c:Candidate)=>void}){
  const [period,setPeriod]=useState(previousBillingQuarter),[page,setPage]=useState(0),[lines,setLines]=useState<Candidate[]>([]),[missing,setMissing]=useState(0),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(false);
  useEffect(()=>{
    setLines([]);setMore(false);setMissing(0);if(!open)return;
    const controller=new AbortController();setLoading(true);setError('');
    getData(new URLSearchParams({kind:'source',patientId:patient.id,...period,page:String(page)}),locale,controller.signal).then(d=>{if(!controller.signal.aborted){setLines(d.lines);setMissing(d.entriesWithoutPositions);setMore(d.hasMore);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[patient.id,period,page,open,locale]);
  return <details className={styles.panel} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{t('billing.work.sources',locale)}</summary><p className={styles.muted}>{t('billing.sourceScope',locale)}</p><div className={styles.grid}>{(['from','to'] as const).map(k=><label key={k}>{t(`billing.${k}`,locale)}<input type="date" value={period[k]} onChange={e=>{setPeriod({...period,[k]:e.target.value});setPage(0);}}/></label>)}</div>{error&&<p role="alert">{error}</p>}{loading&&<p role="status">{t('billing.work.loading',locale)}</p>}{missing>0&&<p>{t('billing.emptyEntries',locale)}: {missing}</p>}{!loading&&!error&&lines.length===0&&<p>{t('billing.work.emptySources',locale)}</p>}<ul className={styles.list}>{lines.map(c=><li key={c.source.recordId+':'+c.source.positionIndex}><strong>{c.schedule} {c.code} · {c.description}</strong><p>{c.serviceDate} · {t('billing.work.quantity',locale)}: {c.quantity??t('billing.work.missing',locale)}</p><button disabled={!c.schedule} onClick={()=>onSelect(c)}>{t('billing.work.useSource',locale)}</button>{!c.schedule&&<p>{t('billing.issue.invalid_schedule',locale)}</p>}</li>)}</ul><Pager page={page} more={more} loading={loading} locale={locale} onChange={setPage}/></details>;
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
