import { z } from "zod";
import { assessBillingCase, billingDate, tariffVersionSchema, type ScribeBillingEntry } from "./billing-foundation";

const text = z.string().trim().min(1).max(1000);
const decimal = z.string().regex(/^\d{1,9}(?:\.\d{1,7})?$/).refine(v => Number(v)>0);
const singleCode = (s: string, c: string) => s==='BEMA' ? /^\d{1,3}[a-z]?$/i.test(c) : s==='GOZ' ? /^\d{4}$/.test(c) : c.length>0;
export const tariffInput = z.object({
  sourceReference: text, validFrom: billingDate, validTo: billingDate,
  schedule: z.enum(['BEMA','GOZ','LABOR','MATERIAL']), code: z.string().trim().min(1).max(30),
  insurerId: text.nullable(), requiresRegion: z.boolean(),
  price: z.discriminatedUnion('kind',[
    z.object({kind:z.literal('points'),points:decimal,pointValueEuro:decimal}).strict(),
    z.object({kind:z.literal('unit'),unitPriceEuro:decimal}).strict(),
  ]),
}).strict().refine(v=>v.validFrom<=v.validTo && singleCode(v.schedule,v.code) &&
  (v.schedule!=='BEMA'||!!v.insurerId) && (v.schedule!=='GOZ'||v.price.kind==='points'));
export const serviceInput = z.object({
  patientId:z.string().uuid(), serviceDate:billingDate,
  source:z.object({system:z.enum(['scribe','ivoris','practice_import','manual']),recordId:text,version:z.number().int().positive(),positionIndex:z.number().int().nonnegative()}).strict(),
  schedule:z.enum(['BEMA','GOZ','LABOR','MATERIAL']),code:z.string().trim().min(1).max(50),description:text,
  quantity:z.number().int().positive().max(10000).nullable(),region:text.nullable(),factor:decimal.nullable(),justification:text.nullable(),
  insurerId:text.nullable(),tariffVersionId:z.string().uuid().nullable(),
}).strict();
const reason=z.string().trim().min(3).max(1000);
const saveBase={action:z.literal('save'),recordId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),reason};
export const workspaceCommand=z.union([
  z.object({...saveBase,kind:z.literal('tariff'),data:tariffInput}).strict(),
  z.object({...saveBase,kind:z.literal('service'),data:serviceInput}).strict(),
  z.object({action:z.enum(['approve','withdraw']),versionId:z.string().uuid(),reason}).strict(),
]);
export type BillingVersion={id:string;record_id:string;revision:number;data:Record<string,unknown>;state:'draft'|'approved'|'withdrawn';tariff_version_id:string|null;gross_cents:number|null;reason:string;created_at:string;created_by:string;decided_at:string|null;decided_by:string|null;decision_reason:string|null};
export type BillingRecord={id:string;kind:'tariff'|'service';patient_id:string|null;head_version:number};

export function sourceIsCurrent(data:z.infer<typeof serviceInput>,entry:ScribeBillingEntry|null){
  return data.source.system!=='scribe'||!!(entry&&entry.id===data.source.recordId&&entry.patient_id===data.patientId&&entry.version===data.source.version&&entry.status==='bestaetigt'&&entry.bestaetigt_am&&entry.termin_datum===data.serviceDate&&Array.isArray(entry.positionen)&&data.source.positionIndex<entry.positionen.length);
}

export function reviewService(data:unknown,tariff:BillingVersion|null,actor:string,now:string){
  const parsed=serviceInput.safeParse(data);
  if(!parsed.success)return {ok:false as const,issues:['invalid_field'],grossCents:null};
  const value=parsed.data;
  const tariffData=tariff?.state==='approved'?tariffVersionSchema.safeParse({...tariff.data,id:tariff.record_id,version:tariff.revision}):null;
  const {insurerId,tariffVersionId,...line}=value;
  const result=assessBillingCase({patientId:value.patientId,from:value.serviceDate,to:value.serviceDate,insurerId,
    patientShareBasisPoints:10000,shareSourceReference:'gross-only-not-patient-debt',scopeConfirmed:true,expectedPatientCents:null},
    [{...line,billingConfirmedBy:actor,billingConfirmedAt:now,tariff:tariffData?.success?tariffData.data:null}]);
  return {ok:result.status==='ready_for_review',issues:Array.from(new Set(result.issues.map(i=>i.code))),grossCents:result.grossCents};
}
