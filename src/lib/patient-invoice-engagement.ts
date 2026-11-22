type InvoiceEvent={event:'invoice_opened';documentId:string}|{event:'app_installed'};
const memory=new Map<string,Record<string,InvoiceEvent>>(),busy=new Set<string>();
const key=(patientId:string)=>`ac_invoice_events:${patientId}`;
function pending(patientId:string):Record<string,InvoiceEvent>{
 if(memory.has(patientId))return memory.get(patientId)!;
 try{const value=JSON.parse(localStorage.getItem(key(patientId))??'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
function save(patientId:string,events:Record<string,InvoiceEvent>){
 memory.set(patientId,events);try{localStorage.setItem(key(patientId),JSON.stringify(events));}catch{/* Retry within this tab when persistent storage is unavailable. */}
}
async function flush(patientId:string){
 if(busy.has(patientId))return;busy.add(patientId);
 try{
  for(const [id,event] of Object.entries(pending(patientId))){
   try{
    const response=await fetch('/api/patient/rechnungen/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(event),signal:AbortSignal.timeout(10000)});
    if(response.ok||[400,403,404].includes(response.status)){const rest=pending(patientId);delete rest[id];save(patientId,rest);}
   }catch{/* Retain the actual invoice event for retry; never substitute a generic app visit. */}
  }
 }finally{busy.delete(patientId);}
}
export function queuePatientInvoiceEvent(patientId:string,event:InvoiceEvent){
 const events=pending(patientId);events[event.event==='invoice_opened'?event.documentId:'installed']=event;save(patientId,events);void flush(patientId);
}
export function startPatientInvoiceTracking(patientId:string){
 const retry=()=>{void flush(patientId);};retry();const timer=window.setInterval(retry,30000);window.addEventListener('online',retry);
 return ()=>{window.clearInterval(timer);window.removeEventListener('online',retry);};
}
