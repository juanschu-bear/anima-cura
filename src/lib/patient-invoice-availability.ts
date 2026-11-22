export type InvoiceReadError={code?:string;message?:string}|null;
/** SQLSTATE 42501 also means broken definer/schema ACLs; only our explicit guard is a patient denial. */
export function invoiceReadDenied(error:InvoiceReadError){
 return error?.code==='42501'&&error.message==='patient_invoice_forbidden';
}
export function patientInvoiceAvailability(errors:{documents:InvoiceReadError;editions:InvoiceReadError;memberships:InvoiceReadError},checkedAt=new Date().toISOString()){
 const unavailable=Boolean(errors.documents||errors.memberships);
 return {status:unavailable?'unavailable' as const:'available' as const,
  code:unavailable?'invoice_source_unavailable':null,
  editionsStatus:errors.editions?'unavailable' as const:'available' as const,
  retryable:unavailable,checkedAt};
}
