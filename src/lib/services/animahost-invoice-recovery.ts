import type {createServerClient} from '@/lib/db/supabase';

type Db=ReturnType<typeof createServerClient>;
type Cause='already_available'|'no_invoice'|'manual_review';
export type InvoiceRecovery={cause:Cause;invoiceDate:string|null};

/** A storage or service-role check cannot establish what the patient's login can see. */
export async function recoverPatientInvoice(
 _db:Db,_patientId:string,_filter:{from:string|null;through:string|null},
):Promise<InvoiceRecovery>{
 return {cause:'manual_review',invoiceDate:null};
}
