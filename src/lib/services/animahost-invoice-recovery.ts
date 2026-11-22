import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {createServerClient} from '@/lib/db/supabase';
import {BILLING_DOCUMENTS_BUCKET,billingDocumentPath,billingDocumentUrl} from '@/lib/billing-document-access';
import {buildIssuedInvoicePdf} from '@/lib/billing-invoice';
import {encodePatientDocumentName} from '@/lib/patient-document-types';

type Db=ReturnType<typeof createServerClient>;
type Cause='document_restored'|'pdf_restored'|'already_available'|'no_invoice'|'manual_review';
export type InvoiceRecovery={cause:Cause;invoiceDate:string|null};
type Source={id:string;date:string;number:string;hash?:string;snapshot?:unknown;imported:boolean};
const importedSchema=z.array(z.object({id:z.string().uuid(),date:z.string().nullable(),
 invoiceNumber:z.string().nullable(),content:z.string().nullable()})).max(51);
const isPdf=(bytes:Buffer)=>bytes.length>=5&&bytes.subarray(0,5).toString()==='%PDF-';
const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

export async function recoverPatientInvoice(db:Db,patientId:string,filter:{from:string|null;through:string|null}):Promise<InvoiceRecovery>{
 const manual={cause:'manual_review' as const,invoiceDate:null};
 const [issued,imported,existing,account]=await Promise.all([
  db.from('billing_invoices').select('issue_date,invoice_number,document_id,storage_path,pdf_sha256,snapshot')
   .eq('patient_id',patientId).eq('status','issued').order('issue_date',{ascending:false}).limit(50),
  db.rpc('animahost_imported_invoice_documents',{p_patient:patientId,p_document:null}),
  db.from('patient_documents').select('id,name,file_url,hochgeladen_am').eq('patient_id',patientId)
   .or('name.ilike.%rechnung%,typ.eq.rechnung').order('hochgeladen_am',{ascending:false}).limit(51),
  db.from('offene_posten').select('id').eq('patient_id',patientId).not('rechnung_nr','is',null).limit(1),
 ]);
 const imports=importedSchema.safeParse(imported.data);
 if(issued.error||imported.error||existing.error||account.error||!imports.success)return manual;
 const source:Source[]=[...issued.data.flatMap(r=>r.document_id&&r.pdf_sha256&&
  r.storage_path===billingDocumentPath(patientId,r.document_id)?[{id:r.document_id,date:r.issue_date,
   number:r.invoice_number,hash:r.pdf_sha256,snapshot:r.snapshot,imported:false}]:[]),
  ...imports.data.flatMap(r=>r.date&&r.invoiceNumber?[{id:r.id,date:r.date,number:r.invoiceNumber,imported:true}]:[])];
 const valid=source.filter(row=>z.string().date().safeParse(row.date).success&&
  (!filter.from||row.date>=filter.from)&&(!filter.through||row.date<=filter.through))
  .sort((a,b)=>b.date.localeCompare(a.date));
 if(!valid.length){
  if(!source.length&&!existing.data.length&&!account.data.length&&issued.data.length===0&&imports.data.length===0)
   return {cause:'no_invoice',invoiceDate:null};
  return manual;
 }
 const chosen=valid[0];
 if(new Set(valid.filter(row=>row.date===chosen.date).map(row=>row.id)).size>1)return manual;
 const path=billingDocumentPath(patientId,chosen.id);
 const storage=db.storage.from(BILLING_DOCUMENTS_BUCKET);
 const [linked,stored,bucket]=await Promise.all([
  db.from('patient_documents').select('patient_id,file_url').eq('id',chosen.id).maybeSingle(),
  storage.download(path),db.storage.getBucket(BILLING_DOCUMENTS_BUCKET),
 ]);
 if(linked.error||(linked.data&&linked.data.patient_id!==patientId)||bucket.error||bucket.data?.public!==false)return manual;
 let bytes=stored.data&&stored.data.size<=25*1024*1024?Buffer.from(await stored.data.arrayBuffer()):null;
 const intact=Boolean(bytes&&isPdf(bytes)&&(!chosen.hash||sha(bytes)===chosen.hash));
 if(!intact){
  // Only restore an existing issued PDF from its immutable snapshot or the active exact-match original.
  if(chosen.imported){
   const original=await db.rpc('animahost_imported_invoice_documents',{p_patient:patientId,p_document:chosen.id});
   const parsed=importedSchema.safeParse(original.data);
   const file=parsed.success&&parsed.data.length===1&&parsed.data[0].id===chosen.id?parsed.data[0].content:null;
   bytes=file?Buffer.from(file,'base64'):null;
  }else{
   try{bytes=(await buildIssuedInvoicePdf(chosen.snapshot)).pdf;}catch{return manual;}
  }
  if(!bytes||!isPdf(bytes)||(chosen.hash&&sha(bytes)!==chosen.hash))return manual;
  const uploaded=await storage.upload(path,bytes,{contentType:'application/pdf',upsert:false});
  if(uploaded.error){
   const reread=await storage.download(path);
   if(!reread.data||sha(Buffer.from(await reread.data.arrayBuffer()))!==sha(bytes))return manual;
  }
 }
 const url=billingDocumentUrl(chosen.id);
 if(!linked.data){
  const insert=await db.from('patient_documents').upsert({id:chosen.id,patient_id:patientId,
   name:encodePatientDocumentName(`Rechnung ${chosen.number}`,'rechnung'),typ:'ratenzahlung',file_url:url},
  {onConflict:'id',ignoreDuplicates:true});
  if(insert.error)return manual;
 }else if(linked.data.file_url!==url){
  const fixed=await db.from('patient_documents').update({file_url:url})
   .eq('id',chosen.id).eq('patient_id',patientId).eq('file_url',linked.data.file_url);
  if(fixed.error)return manual;
 }
 const final=await db.from('patient_documents').select('patient_id,file_url').eq('id',chosen.id).maybeSingle();
 if(final.error||final.data?.patient_id!==patientId||final.data?.file_url!==url)return manual;
 return {cause:!intact?'pdf_restored':!linked.data||linked.data.file_url!==url?'document_restored':'already_available',
  invoiceDate:chosen.date};
}
