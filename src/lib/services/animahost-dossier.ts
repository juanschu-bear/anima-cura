import type {createServerClient} from '@/lib/db/supabase';
import {patientIsMinor,type PhonePatient} from './animahost-chat-identity';
import {recoverPatientInvoice} from './animahost-invoice-recovery';

/**
 * Die Akte, die AnimaHost liest, bevor er antwortet (Juan, 22.11.2026: erst wissen, wer schreibt und was dahinter steckt).
 * 2 Stufen:
 *  - Jede Akte der Nummer: wer das ist, Kind oder erwachsen, App-Zugang, ob Rechnungen im Portal liegen.
 *  - Nur bei bestätigter Person (Geburtsdatum in diesem Chat oder Bestätigung durch die Praxis): Besuche, Rechnungsdatum, Mahnungen, Raten.
 * Vertrauliches wird für eine unbestätigte Person gar nicht geladen. So kann es auch nicht versehentlich in einer Antwort landen.
 * Beträge stehen nie in der Akte: Die sieht der Patient in der App.
 * Was sich nicht lesen lässt, ist `null` („unbekannt“) und nie eine Annahme.
 */
type Db=ReturnType<typeof createServerClient>;

export type DossierPatient={
 id:string;firstName:string;lastName:string;
 /** true: Kind, false: erwachsen, null: Geburtsdatum fehlt. */
 minor:boolean|null;
 verified:boolean;
 treatment:string|null;
 /** Hat ein Login für die App. null: nicht lesbar. */
 appAccount:boolean|null;
 /** Hat Rechnungen in der App schon geöffnet. null: nicht lesbar oder kein Zugang. */
 openedInvoicesInApp:boolean|null;
 /** Ob Rechnungen im Portal abrufbar sind, geprüft über denselben Weg wie die App. */
 invoices:'available'|'none'|'unclear';
 /** Nur bei bestätigter Person. */
 confidential?:{
  newestInvoiceDate:string|null;
  lastVisits:string[];
  reminders:{invoiceDate:string|null;remindedOn:string}[];
  installmentPlan:boolean|null;
  nextInstallmentDue:string|null;
 };
};
export type Dossier={
 /** Wer vermutlich schreibt: unbekannte Nummer, der Patient selbst oder ein Elternteil. */
 sender:'unknown'|'patient'|'guardian';
 patients:DossierPatient[];
};

const day=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)?value.slice(0,10):null;
type Rows<T>={data:T[]|null;error:unknown};
/** Eine fehlgeschlagene Abfrage macht nur ihr Feld unbekannt, nie die ganze Akte. */
async function rows<T>(query:PromiseLike<Rows<T>>):Promise<T[]|null>{
 try{const result=await query;return result.error||!Array.isArray(result.data)?null:result.data;}catch{return null;}
}

export async function loadDossier(db:Db,input:{patients:PhonePatient[];verifiedIds:string[];today:string}):Promise<Dossier>{
 const patients=input.patients.slice(0,8);
 if(!patients.length)return {sender:'unknown',patients:[]};
 const ids=patients.map(patient=>patient.id);
 const verified=new Set(input.verifiedIds.filter(id=>ids.includes(id)));
 const confirmed=Array.from(verified);
 const [extra,profiles,memberships,reads,invoices,visits,reminders,plans,installments]=await Promise.all([
  rows<{id:string;behandlung:string|null}>(db.from('patients').select('id,behandlung').in('id',ids)),
  rows<{patient_id:string|null}>(db.from('user_profiles').select('patient_id').eq('role','patient').in('patient_id',ids)),
  rows<{patient_id:string}>(db.from('patient_access_memberships').select('patient_id').in('patient_id',ids)),
  rows<{patient_id:string|null}>(db.from('invoice_access_events').select('patient_id').eq('event','app_read').in('patient_id',ids).limit(200)),
  Promise.all(ids.map(id=>recoverPatientInvoice(db,id,{from:null,through:null}))),
  confirmed.length?rows<{patient_id:string;termin_datum:string|null}>(db.from('doku_eintraege').select('patient_id,termin_datum')
   .in('patient_id',confirmed).lte('termin_datum',input.today).order('termin_datum',{ascending:false}).limit(40)):Promise.resolve([]),
  confirmed.length?rows<{patient_id:string;rechnung_datum:string|null;mahnung_datum:string|null}>(db.from('offene_posten')
   .select('patient_id,rechnung_datum,mahnung_datum').in('patient_id',confirmed).not('mahnung_datum','is',null)
   .order('mahnung_datum',{ascending:false}).limit(20)):Promise.resolve([]),
  confirmed.length?rows<{patient_id:string;status:string|null}>(db.from('ratenplaene').select('patient_id,status').in('patient_id',confirmed).limit(20)):Promise.resolve([]),
  confirmed.length?rows<{patient_id:string;faellig_am:string|null;status:string|null}>(db.from('raten').select('patient_id,faellig_am,status')
   .in('patient_id',confirmed).gte('faellig_am',input.today).order('faellig_am',{ascending:true}).limit(40)):Promise.resolve([]),
 ]);
 const accounts=profiles&&memberships?new Set([...profiles.map(row=>row.patient_id),...memberships.map(row=>row.patient_id)]):null;
 const readers=reads?new Set(reads.map(row=>row.patient_id)):null;
 const list=patients.map((patient,index):DossierPatient=>{
  const invoice=invoices[index];
  const hasAccount=accounts?accounts.has(patient.id):null;
  const base:DossierPatient={id:patient.id,firstName:patient.vorname,lastName:patient.nachname,
   minor:patientIsMinor(patient.geburtsdatum,input.today),verified:verified.has(patient.id),
   treatment:extra?.find(row=>row.id===patient.id)?.behandlung?.trim()||null,
   appAccount:hasAccount,openedInvoicesInApp:hasAccount&&readers?readers.has(patient.id):null,
   invoices:invoice.checked?(invoice.cause==='already_available'?'available':invoice.cause==='no_invoice'?'none':'unclear'):'unclear'};
  if(!base.verified)return base;
  const own=<T extends {patient_id:string}>(source:T[]|null)=>source?.filter(row=>row.patient_id===patient.id)??null;
  const visited=own(visits),reminded=own(reminders),plan=own(plans),due=own(installments);
  return {...base,confidential:{
   newestInvoiceDate:invoice.checked?day(invoice.invoiceDate):null,
   lastVisits:Array.from(new Set((visited??[]).map(row=>day(row.termin_datum)).filter((value):value is string=>Boolean(value)))).slice(0,3),
   reminders:(reminded??[]).flatMap(row=>{const on=day(row.mahnung_datum);return on?[{invoiceDate:day(row.rechnung_datum),remindedOn:on}]:[];}).slice(0,3),
   installmentPlan:plan?plan.some(row=>!/abgeschlossen|storniert|beendet/i.test(row.status??'')):null,
   nextInstallmentDue:day((due??[]).find(row=>!/bezahlt/i.test(row.status??''))?.faellig_am)}};
 });
 const anyMinor=list.some(patient=>patient.minor!==false);
 return {sender:list.length===1&&!anyMinor?'patient':'guardian',patients:list};
}

const date=(iso:string)=>`${iso.slice(8,10)}.${iso.slice(5,7)}.${iso.slice(0,4)}`;
/**
 * Die Akte so, wie das Modell sie liest: deutsche Schlüssel, Daten als TT.MM.JJJJ, „unbekannt“ statt Lücken.
 * Dazu `facts`: jede Zahl und jedes Datum, das eine Antwort aus der Akte nennen darf. Alles andere gilt als erfunden.
 */
export function dossierForModel(dossier:Dossier):{akte:unknown;facts:string[];names:string[]}{
 const facts:string[]=[];
 const known=(value:boolean|null,yes:string,no:string)=>value===null?'unbekannt':value?yes:no;
 const say=(iso:string|null)=>{if(!iso)return 'unbekannt';const text=date(iso);facts.push(text);return text;};
 const akte={
  schreibt:dossier.sender==='unknown'?'Nummer ohne Akte':dossier.sender==='patient'?'vermutlich der Patient selbst':'vermutlich ein Elternteil',
  patienten:dossier.patients.map(patient=>({
   vorname:patient.firstName,nachname:patient.lastName,
   alter:patient.minor===null?'unbekannt':patient.minor?'Kind':'erwachsen',
   behandlung:patient.treatment??'unbekannt',
   appZugang:known(patient.appAccount,'vorhanden','noch keiner'),
   rechnungenInDerAppGeoeffnet:known(patient.openedInvoicesInApp,'ja','noch nie'),
   rechnungenImPortal:patient.invoices==='available'?'abrufbar':patient.invoices==='none'?'noch keine vorhanden':'konnte nicht geprüft werden',
   bestaetigt:patient.verified,
   ...(patient.confidential?{vertraulich:{
    neuesteRechnungVom:say(patient.confidential.newestInvoiceDate),
    letzteBesuche:patient.confidential.lastVisits.map(value=>say(value)),
    zahlungserinnerungen:patient.confidential.reminders.map(item=>({rechnungVom:say(item.invoiceDate),erinnertAm:say(item.remindedOn)})),
    ratenzahlung:known(patient.confidential.installmentPlan,'vereinbart','keine'),
    naechsteRateFaelligAm:patient.confidential.nextInstallmentDue?say(patient.confidential.nextInstallmentDue):'keine offene Rate bekannt',
   }}:{}),
  })),
 };
 return {akte,facts,names:dossier.patients.flatMap(patient=>[patient.firstName,patient.lastName])};
}
