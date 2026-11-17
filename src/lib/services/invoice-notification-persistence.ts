import { createHash } from "node:crypto";

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
