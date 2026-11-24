/** An invoice is existing patient data even when no OP row or installment plan exists. */
export function patientHasFinancialData(input:{reportedFinancialData:unknown;paymentCount:number;invoiceCount:number;invoiceHistoryCount:number}){
 return Boolean(input.reportedFinancialData)||input.paymentCount>0||input.invoiceCount>0||input.invoiceHistoryCount>0;
}
