'use client';
import {useState} from 'react';
import {t} from '@/lib/i18n';
type Entry={id:string;patient_id:string;version:number;text:string;zaehne:string[];status:string};
export default function ClarifyEntry({entry,onSaved}:{entry:Entry;onSaved:(value:any)=>void}){
 const [open,setOpen]=useState(false),[text,setText]=useState(entry.text),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 async function save(){
  if(busy||!text.trim()||!reason.trim())return;
  setBusy(true);setError('');setSaved(false);
  try{
   const response=await fetch(`/api/doku/eintrag/${entry.id}/version`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,aenderungsgrund:reason,expected_version:entry.version,patient_id:entry.patient_id})});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||t('scribe.clarify.failed'));
   // A partial history write must not be presented as successful completion.
   if(response.status===207){setError(t('scribe.room.historyWarning'));setOpen(false);onSaved(result.eintrag);return;}
   onSaved(result.eintrag);setOpen(false);setSaved(true);setReason('');
  }catch(error){setError(error instanceof Error?error.message:t('scribe.clarify.failed'));}finally{setBusy(false);}
 }
 return <section style={{marginTop:16}}>
  <p className="detailmeta">{t('scribe.clarify.help')}</p>
  {!open?<button className="neben" onClick={()=>setOpen(true)}>{t('scribe.clarify.open')}</button>:<div className="feld">
   <label htmlFor="clarify-text">{t('scribe.clarify.text')}</label><textarea id="clarify-text" rows={8} value={text} onChange={e=>setText(e.target.value)} disabled={busy} style={{width:'100%'}}/>
   <p className="detailmeta">{t('scribe.clarify.structured')}</p>
   <label htmlFor="clarify-reason">{t('scribe.clarify.reason')}</label><input id="clarify-reason" value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}/>
   <div className="aktionen"><button className="haupt" disabled={busy||!text.trim()||!reason.trim()||text===entry.text} onClick={()=>void save()}>{t('scribe.clarify.save')}</button><button className="neben" disabled={busy} onClick={()=>setOpen(false)}>{t('scribe.clarify.cancel')}</button></div>
  </div>}
  {error&&<p role="alert" className="detailfehlerbox">{error}</p>}
  {saved&&<p role="status">{t('scribe.clarify.saved')}</p>}
 </section>;
}
