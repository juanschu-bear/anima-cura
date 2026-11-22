import {z} from 'zod';
import type {createServerClient} from '@/lib/db/supabase';

type Db=ReturnType<typeof createServerClient>;
const visibilitySchema=z.object({
 cause:z.enum(['already_available','no_invoice','manual_review']),
 invoiceDate:z.string().date().nullable(),
});
export type InvoiceRecovery=z.infer<typeof visibilitySchema>&{checked?:boolean};
const manual={cause:'manual_review',invoiceDate:null} as const;

/** Read the account scope and selected PDF used by the app, without copying any documents. */
export async function recoverPatientInvoice(
 db:Db,patientId:string|null,filter:{from:string|null;through:string|null},
):Promise<InvoiceRecovery>{
 try{
  const result=await db.rpc('animahost_invoice_portal_visibility',{p_patient:patientId,p_from:filter.from,p_through:filter.through});
  if(result.error)return manual;
  const parsed=visibilitySchema.safeParse(result.data);
  return parsed.success?{...parsed.data,checked:true}:manual;
 }catch{return manual;}
}
