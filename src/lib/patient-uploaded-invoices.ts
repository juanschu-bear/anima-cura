import type {createServerClient} from "@/lib/db/supabase";
import {billingDocumentPath,billingDocumentUrl,BILLING_DOCUMENTS_BUCKET} from "@/lib/billing-document-access";
import {decodePatientDocumentRecord,isInvoiceDocumentType} from "@/lib/patient-document-types";

type Db=ReturnType<typeof createServerClient>;
type Document={id:string;patient_id:string;name:string;typ:string;file_url:string|null;hochgeladen_am:string|null};

export const patientInvoicePdfUrl=(id:string)=>`/api/patient/rechnungen/${id}/pdf`;
const uploadPdfUrl=(id:string)=>`${patientInvoicePdfUrl(id)}?source=upload`;

function publishedLegacyInvoice(document:Document){
  return document.id[14]==="5"&&/^Rechnung [1-4]\/\d{4} · (?:BEMA|GOZ) · /.test(decodePatientDocumentRecord(document).name);
}

function originalUploadPath(document:Document){
  try{
    const base=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL??"");
    const url=new URL(document.file_url??"");
    const prefix="/storage/v1/object/public/documents/";
    if(url.origin!==base.origin||!url.pathname.startsWith(prefix))return null;
    const path=decodeURIComponent(url.pathname.slice(prefix.length));
    return path.startsWith(`patient-docs/${document.patient_id}/`)&&!path.split("/").includes("..")?path:null;
  }catch{return null;}
}

async function nativeIssuedIds(db:Db,patientIds:string[]){
  const bills=await db.from("billing_invoices").select("id,document_id").in("patient_id",patientIds).in("status",["issued","void"]);
  if(bills.error)throw Error("uploaded_invoice_unavailable");
  const ids=bills.data.map(row=>row.id);
  const cancellations=ids.length?await db.from("billing_invoice_cancellations").select("document_id").in("invoice_id",ids):{data:[],error:null};
  if(cancellations.error)throw Error("uploaded_invoice_unavailable");
  return new Set([...bills.data,...cancellations.data].map(x=>x.document_id).filter(Boolean));
}

function target(document:Document,nativeIds:Set<string|null>){
  if(document.file_url===patientInvoicePdfUrl(document.id)||
    (document.file_url===billingDocumentUrl(document.id)&&(publishedLegacyInvoice(document)||nativeIds.has(document.id)))){
    return {bucket:BILLING_DOCUMENTS_BUCKET,path:billingDocumentPath(document.patient_id,document.id)};
  }
  const path=originalUploadPath(document);
  return path?{bucket:"documents",path}:null;
}

export async function loadUploadedPatientInvoices(db:Db,patientIds:string[],importedIds:ReadonlySet<string>){
  const result=await db.from("patient_documents").select("id,patient_id,name,typ,file_url,hochgeladen_am")
    .in("patient_id",patientIds)
    .or("typ.in.(rechnung,erste_rechnung),name.ilike.[[typ:rechnung]]%,name.ilike.[[typ:erste_rechnung]]%")
    .order("hochgeladen_am",{ascending:false});
  if(result.error)throw Error("uploaded_invoice_unavailable");
  const typed=(result.data as Document[]).filter(d=>!importedIds.has(d.id)&&isInvoiceDocumentType(decodePatientDocumentRecord(d).typ));
  const oldPrivate=typed.some(d=>d.file_url===billingDocumentUrl(d.id)&&!publishedLegacyInvoice(d));
  const nativeIds=oldPrivate?await nativeIssuedIds(db,patientIds):new Set<string>();
  return typed.flatMap(row=>{
    if(!target(row,nativeIds))return [];
    const {name,typ}=decodePatientDocumentRecord(row);
    return [{id:row.id,patientId:row.patient_id,typ:"rechnungsbeleg",source:"patient_upload",name,
      documentType:typ,rechnung_datum:null,uploadedAt:row.hochgeladen_am,rechnung_nr:null,unser_zeichen:null,
      betrag:null,offen:0,gezahlt:0,status:"beleg",bezahlt_am:null,mahnung_datum:null,
      paymentStatusKnown:false,paymentActionAllowed:false,beleg:{
        id:row.id,patientId:row.patient_id,pdf:true as const,pdfUrl:uploadPdfUrl(row.id),
        positionen:[],begruendungen:[],art:null,quartal:null,
      }}];
  });
}

export async function loadUploadedPatientInvoicePdf(db:Db,patientIds:string[],documentId:string){
  const result=await db.from("patient_documents").select("id,patient_id,name,typ,file_url,hochgeladen_am")
    .eq("id",documentId).in("patient_id",patientIds).maybeSingle();
  if(result.error)throw Error("uploaded_invoice_unavailable");
  const d=result.data as Document|null;
  if(!d||!isInvoiceDocumentType(decodePatientDocumentRecord(d).typ))return null;
  const nativeIds=d.file_url===billingDocumentUrl(d.id)&&!publishedLegacyInvoice(d)?await nativeIssuedIds(db,[d.patient_id]):new Set<string>();
  const file=target(d,nativeIds);
  if(!file)return null;
  if(file.bucket===BILLING_DOCUMENTS_BUCKET){
    const {data,error}=await db.storage.getBucket(file.bucket);
    if(error||data?.public!==false)throw Error("uploaded_invoice_source_unavailable");
  }
  const {data,error}=await db.storage.from(file.bucket).download(file.path);
  if(error||!data||data.size>25*1024*1024||await data.slice(0,5).text()!=="%PDF-")
    throw Error("uploaded_invoice_source_unavailable");
  return new Uint8Array(await data.arrayBuffer());
}
