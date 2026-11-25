import {z} from 'zod';
import type {createServerClient} from '@/lib/db/supabase';
import {selectPhonePatient,maskBirthDates,type PhonePatient} from './animahost-chat-identity';
import {loadDossier,dossierForModel} from './animahost-dossier';
import {resolveOpenItemAmount} from '@/lib/open-items';
export const concernHistorySchema=z.object({complete:z.boolean(),casesComplete:z.boolean().optional(),openCases:z.array(z.object({patientId:z.string().nullable(),at:z.string(),summary:z.string().max(1000)})).max(100).optional(),messages:z.number().int().nonnegative(),from:z.string().nullable(),through:z.string(),concerns:z.array(z.object({topic:z.string().max(80),messages:z.number().int(),days:z.number().int(),first:z.string(),last:z.string(),examples:z.array(z.string().max(500)).max(3)})).max(16)});
export type ConcernHistory=z.infer<typeof concernHistorySchema>;
export type PatientSheet={access:'confirmed'|'unconfirmed'|'ambiguous'|'unlinked';asOf:string;patientId?:string;verification?:'conversation';context:Record<string,unknown>;fields:Record<string,'filled'|'empty'|'unavailable'>};
type Db=ReturnType<typeof createServerClient>;
async function read(query:PromiseLike<{data:any;error:any}>){try{const r=await query;return r.error?null:r.data;}catch{return null;}}
export function selectedConfirmedPatient(patients:PhonePatient[],verified:string[],message:string){
 const selected=selectPhonePatient(patients,message);
 return selected&&verified.includes(selected.id)?selected:null;
}
export function relativeAppointment(date:string,today:string){
 const days=Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000);
 const weekday=new Date(today+'T12:00:00Z').getUTCDay()||7;
 return {date,relative:days===0?'heute':days===1?'morgen':days===-1?'gestern':null,thisWeek:days>=1-weekday&&days<=7-weekday};
}
export function sheetLedger(sheet:PatientSheet){return {access:sheet.access,asOf:sheet.asOf,fields:sheet.fields,...(sheet.verification?{verification:sheet.verification}:{})};}
/** Read only. Never load an unconfirmed patient's clinical/financial sheet. */
export async function loadPatientSheet(db:Db,input:{tenantId:string;patients:PhonePatient[];verifiedIds:string[];message:string;today:string;at:string;chatJid:string;phone:string|null;conversationPatientId?:string;confirmedPatientId?:string;chatPatientCount?:number;senderRelative?:{name:string;role:string};concernHistory?:ConcernHistory}):Promise<PatientSheet>{
 const provisional=input.patients.find(patient=>patient.id===input.conversationPatientId);
 const explicit=input.patients.find(patient=>patient.id===input.confirmedPatientId&&input.verifiedIds.includes(patient.id));
 const p=explicit??provisional??selectedConfirmedPatient(input.patients,input.verifiedIds,input.message);
 const sheet:PatientSheet={access:!input.patients.length?'unlinked':!selectPhonePatient(input.patients,input.message)?'ambiguous':'unconfirmed',asOf:new Date().toISOString(),context:{},fields:{}};
 if(!p)return sheet;
 sheet.access='confirmed';sheet.patientId=p.id;
 if(provisional&&!input.verifiedIds.includes(p.id))sheet.verification='conversation';
 const [dossier,patient,phases,appointments,open,profiles,memberships,cases,clinicalCases]=await Promise.all([
  loadDossier(db,{patients:[p],verifiedIds:[p.id],today:input.today}),
  read(db.from('patients').select('behandlung,behandlungsart,behandlung_status,guthaben,notizen,telefon,mobiltelefon,versicherter_vorname,versicherter_nachname,versicherter_telefon,eb2_vorname,eb2_nachname,eb2_telefon').eq('id',p.id).single()),
  read(db.from('behandlungsphasen').select('name,beschreibung,status,start_datum,end_datum').eq('patient_id',p.id).order('reihenfolge')),
  read(db.from('tagesplan_termine').select('datum,uhrzeit,status,behandlung_art,notizen').eq('patient_id',p.id).order('datum',{ascending:false}).limit(500)),
  read(db.from('offene_posten').select('rechnung_datum,rechnung_nr,betrag,offen,gezahlt,status').eq('patient_id',p.id).order('rechnung_datum',{ascending:false}).limit(500)),
  read(db.from('user_profiles').select('id').eq('role','patient').eq('patient_id',p.id).limit(1)),
  read(db.from('patient_access_memberships').select('user_id').eq('patient_id',p.id).limit(1)),
  read(db.from('animahost_appointment_cases').select('status,note,appointment_date,original_time,arrival_time').eq('tenant_id',input.tenantId).eq('chat_jid',input.chatJid).eq('status','pending')),
  read(db.from('doku_positions_klaerfaelle').select('status,conflicts,created_at').eq('patient_id',p.id).is('resolved_at',null)),
 ]);
 const put=(key:string,value:unknown)=>{sheet.context[key]=value??'unbekannt';sheet.fields[key]=value==null?'unavailable':Array.isArray(value)&&!value.length||value===''?'empty':'filled';};
 const normalize=(v:unknown)=>String(v??'').replace(/\D/g,'').replace(/^00/,'').replace(/^0/,'49');
 const parent=patient&&input.phone?[['versicherter',patient.versicherter_telefon],['eb2',patient.eb2_telefon]].find(([,phone])=>phone&&normalize(phone)===normalize(input.phone)):null;
 const ownPhone=patient&&input.phone&&[patient.telefon,patient.mobiltelefon].some(phone=>phone&&normalize(phone)===normalize(input.phone));
 put('schreibendePerson',input.senderRelative?{rolle:input.senderRelative.role==='recipient'?'Rechnungsempfänger':'Sorgeberechtigte/Hauptversicherte',name:input.senderRelative.name,patient:p.vorname+' '+p.nachname}:{rolle:parent?'Elternteil':ownPhone||dossier.sender==='patient'?'Patient':'Zuordnung als Elternteil nicht belegt',name:parent?[patient[parent[0]+'_vorname'],patient[parent[0]+'_nachname']].filter(Boolean).join(' '):null,patient:p.vorname+' '+p.nachname});
 put('akte',dossierForModel(dossier).akte);
 put('apparatur',patient?.behandlung||null);put('behandlungsart',patient?.behandlungsart||null);put('behandlungsphasen',phases);
 const planned=appointments?.filter((r:any)=>['geplant','erwartet','eingecheckt','in_behandlung'].includes(r.status)&&r.datum>=input.today).sort((a:any,b:any)=>(a.datum+' '+a.uhrzeit).localeCompare(b.datum+' '+b.uhrzeit));
 const shape=(r:any)=>r?{...relativeAppointment(r.datum,input.today),time:r.uhrzeit?.slice(0,5),status:r.status,treatment:r.behandlung_art}:null;
 put('nächsterTermin',shape(planned?.[0]));
 put('letzterTermin',shape(appointments?.find((r:any)=>r.datum<=input.today&&/behandelt|abgeschlossen|erledigt|fertig/i.test(r.status))));
 put('verpassteOderVerschobeneTermine',appointments?.filter((r:any)=>/verpasst|erschienen|abgesagt|storniert|verschoben/i.test(r.status)).map(shape)??null);
 put('guthaben',patient?.guthaben==null?null:{amountEuro:Number(patient.guthaben),source:'patients.guthaben'});
 put('teamnotizen',patient?.notizen??null);put('offeneKlärfälle',clinicalCases);
 // Chat-scoped cases may concern siblings. Expose only with a single linked patient.
 put('offeneTerminKlärfälle',(input.chatPatientCount??input.patients.length)===1?cases:null);
 put('offeneChatKlärfälle',input.concernHistory?.openCases?.filter(c=>c.patientId===p.id||!c.patientId&&(input.chatPatientCount??input.patients.length)===1).map(c=>({at:c.at,summary:maskBirthDates(c.summary)}))??null);
 put('bisherigeAnliegen',input.concernHistory?{complete:input.concernHistory.complete,messages:input.concernHistory.messages,from:input.concernHistory.from,through:input.concernHistory.through,scope:'gesamter Chat, Zuordnung einzelner Anliegen zu Kindern nicht gesichert',concerns:input.concernHistory.concerns.map(c=>({...c,examples:c.examples.map(maskBirthDates)}))}:null);
 put('offeneRechnungen',open?.filter((r:any)=>resolveOpenItemAmount(r)>0).map((r:any)=>({date:r.rechnung_datum,number:r.rechnung_nr,openEuro:resolveOpenItemAmount(r),status:r.status,delivery:'unbekannt',source:'offene_posten'}))??null);
 const account=profiles?.[0]?.id??memberships?.[0]?.user_id;
 put('portalzugang',profiles&&memberships?Boolean(account):null);
 // Same read-only, account-scoped invoice-record-v1 contract as the patient's app, never a PDF/read-event request.
 let invoices:any[]|null=null,unavailableInvoiceSummaries:number|null=null;
 if(account&&process.env.INVOICE_ACCESS_WORKER_SECRET){try{
  const response=await fetch('https://anima-leitstand.vercel.app/api/abrechnung/invoice-records',{method:'POST',headers:{'content-type':'application/json','x-invoice-worker-secret':process.env.INVOICE_ACCESS_WORKER_SECRET},body:JSON.stringify({accountId:account,mode:'patient',patientId:p.id}),cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(response.ok){const data=await response.json();
   if(Array.isArray(data.records))invoices=data.records.filter((r:any)=>r.patientId===p.id).map((r:any)=>({quarter:r.quarter,date:r.date,number:r.invoiceNumber,amountCents:r.amountCents,payment:r.payment,delivery:r.delivery,patientVisible:r.patientVisible}));
   if(Array.isArray(data.unmatchedHistory))unavailableInvoiceSummaries=data.unmatchedHistory.filter((r:any)=>r.patient_id===p.id&&r.reason==='complete_invoice_unavailable').length;
  }
 }catch{/* unavailable is not unpaid, undelivered or absent */}}
 put('rechnungsakteMitZustellstand',invoices);
 // Delivery is independent of having an app/portal account. The scoped endpoint returns no PDFs or clinical fields.
 let dispatch:unknown[]|null=null;
 if(process.env.INVOICE_ACCESS_WORKER_SECRET){try{
  const response=await fetch('https://anima-leitstand.vercel.app/api/abrechnung/invoice-dispatch',{method:'POST',headers:{'content-type':'application/json','x-invoice-worker-secret':process.env.INVOICE_ACCESS_WORKER_SECRET},body:JSON.stringify({patientId:p.id}),cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(response.ok){const data=await response.json();if(data.contractVersion==='invoice-dispatch-v1'&&data.patientId===p.id&&Array.isArray(data.records)){
   dispatch=data.records.map((record:any)=>invoiceDispatchFact(record,input.at));
   if(typeof data.portalAccessActive==='boolean')put('portalzugang',data.portalAccessActive);
  }}
 }catch{/* Unknown is never a statement that no invoice mail was sent. */}}
 put('rechnungsversand',dispatch??invoices?.map(invoice=>invoiceDispatchFact(invoice,input.at))??null);
 put('vollständigeRechnungImPortalNochNichtVerfügbar',unavailableInvoiceSummaries);
 return sheet;
}

/** Accepted is a sent-mail record, not proof of delivery. Unknown opening is not 'unopened'. */
export function invoiceDispatchFact(invoice:{quarter?:string;number?:string;delivery?:{kind:string;at:string;version?:string}[]},asOf:string){
 const events=(invoice.delivery??[]).filter(e=>e.version!=='history'&&Date.parse(e.at)<=Date.parse(asOf));
 const times=(kind:string)=>events.filter(e=>e.kind===kind).map(e=>e.at).sort((a,b)=>Date.parse(a)-Date.parse(b));
 return {quartal:invoice.quarter??null,rechnungsnummer:invoice.number??null,rechnungsMailAm:times('mail_accepted').at(-1)??null,
  rechnungGeöffnetAm:times('invoice_opened').at(-1)??times('pdf_retrieved').at(-1)??null,pdfAbgerufenAm:times('pdf_retrieved').at(-1)??null,
  zugestelltAm:times('mail_delivered').at(-1)??null,mailGeöffnetAm:times('mail_opened').at(-1)??null,
  geöffnet:times('mail_opened').length>0?true:null,öffnungHinweis:times('mail_opened').length?'belegt':'nicht erfasst oder unbekannt',
  vonDerPraxisVersandt:times('mail_accepted').length>0,quelle:'invoice-record-v1'};
}
