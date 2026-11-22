import {createServerClient} from '@/lib/db/supabase';

/** Server-only evidence after the patient's authorized read, never a list visit or mail pixel. */
export async function recordInvoiceEngagement(accountId:string,documentId:string|null,event:'invoice_opened'|'pdf_retrieved'|'app_installed',patientId:string|null) {
 const db=createServerClient();
 const saved=await db.from('patient_invoice_engagement').upsert({account_id:accountId,patient_id:patientId,document_id:documentId,event_kind:event},
  {onConflict:'account_id,patient_id,document_id,event_kind',ignoreDuplicates:true});
 // Code may arrive before the approved SQL installation. No follow-ups can run in that state.
 if(saved.error?.code==='42P01'||saved.error?.code==='PGRST205')return false;
 if(saved.error)throw Error('invoice_engagement_unavailable');
 return true;
}
