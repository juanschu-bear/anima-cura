import { createHash } from "node:crypto";

/** Select the verified login's notification/device owner, including sibling-only invoices. */
export function invoiceNotificationDeliveryPatients(requested:string[],account:{role:string;patientId:string|null;memberPatientIds:string[]}|null){
  if(!account)return Array.from(new Set(requested));
  const scope=new Set([account.patientId,...account.memberPatientIds]);
  if(account.role!=="patient"||!account.patientId||requested.some(id=>!scope.has(id)))throw Error("account_scope_mismatch");
  return [account.patientId];
}

function uuidFromHash(value: string) {
  const bytes = createHash("sha256").update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function invoiceNotificationRows(input: {
  patientIds: string[];
  jobId: string;
  title: string;
  text: string;
}) {
  return Array.from(new Set(input.patientIds)).map(patientId => ({
    id: uuidFromHash(`anima-cura:invoice-notification:v1:${input.jobId}:${patientId}`),
    patient_id: patientId,
    typ: "eingang" as const,
    titel: input.title,
    text: input.text,
  }));
}
