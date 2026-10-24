import { z } from "zod";
import { assessBillingCase, billingDate, scribeBillingCandidates, tariffVersionSchema, type ScribeBillingEntry } from "./billing-foundation";

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
export const prepareSourceCommand=z.object({action:z.literal('prepare_source'),sourceId:z.string().uuid()}).strict();
export const importTariffsCommand=z.object({action:z.literal('import_tariffs'),tariffs:z.array(tariffInput).min(1).max(100)}).strict().superRefine((value,ctx)=>{
  const identities=new Set<string>();
  value.tariffs.forEach((tariff,index)=>{
    const identity=[tariff.schedule,tariff.code,tariff.insurerId??'',tariff.validFrom,tariff.validTo,tariff.sourceReference].join('|');
    if(identities.has(identity))ctx.addIssue({code:z.ZodIssueCode.custom,path:['tariffs',index],message:'duplicate_tariff_identity'});
    identities.add(identity);
  });
});
export type BillingVersion={id:string;record_id:string;revision:number;data:Record<string,unknown>;state:'draft'|'approved'|'withdrawn';tariff_version_id:string|null;gross_cents:number|null;reason:string;created_at:string;created_by:string;decided_at:string|null;decided_by:string|null;decision_reason:string|null};
export type BillingRecord={id:string;kind:'tariff'|'service';patient_id:string|null;head_version:number};
export type BillingQuarterCase={patientId:string;positions:number;approved:number;missing:number;incomplete:number;draft:number;withdrawn:number;stale:number;emptyEntries:number;blocked:boolean;ready:boolean};

export function summarizeBillingQuarter(entries:ScribeBillingEntry[],records:Array<BillingRecord&{source_record_id?:string;source_position_index?:number}>,versions:BillingVersion[]){
  const current=records.map(record=>({record,version:versions.find(version=>version.record_id===record.id&&version.revision===record.head_version)}));
  const patients=new Map<string,{patientId:string;positions:number;approved:number;missing:number;incomplete:number;draft:number;withdrawn:number;stale:number;emptyEntries:number;blocked:boolean}>();
  const summary={confirmedEntries:entries.length,entriesWithoutPositions:0,sourcePositions:0,missingPositions:0,incompletePositions:0,draftPositions:0,approvedPositions:0,withdrawnPositions:0,stalePositions:0,approvedGrossCents:0,patients:0,readyPatients:0,blockedPatients:0};
  for(const entry of entries){
    const candidates=scribeBillingCandidates([entry]);
    if(candidates.entriesWithoutPositions.length)summary.entriesWithoutPositions++;
    const patient=patients.get(entry.patient_id)??{patientId:entry.patient_id,positions:0,approved:0,missing:0,incomplete:0,draft:0,withdrawn:0,stale:0,emptyEntries:0,blocked:false};
    if(candidates.entriesWithoutPositions.length){patient.blocked=true;patient.emptyEntries++;}
    for(const candidate of candidates.lines as Array<any>){
      summary.sourcePositions++;patient.positions++;
      const incomplete=!candidate.schedule||!candidate.code||!candidate.description||!candidate.quantity;
      if(incomplete){summary.incompletePositions++;patient.incomplete++;patient.blocked=true;}
      const linked=current.find(item=>item.record.source_record_id===entry.id&&item.record.source_position_index===candidate.source.positionIndex);
      if(!linked){summary.missingPositions++;patient.missing++;patient.blocked=true;continue;}
      const versionData=linked.version?serviceInput.safeParse(linked.version.data):null;
      if(!linked.version||!versionData?.success||!sourceIsCurrent(versionData.data,entry)){summary.stalePositions++;patient.stale++;patient.blocked=true;continue;}
      if(linked.version.state==='draft'){summary.draftPositions++;patient.draft++;patient.blocked=true;}
      else if(linked.version.state==='withdrawn'){summary.withdrawnPositions++;patient.withdrawn++;patient.blocked=true;}
      else{summary.approvedPositions++;patient.approved++;summary.approvedGrossCents+=linked.version.gross_cents??0;}
    }
    patients.set(entry.patient_id,patient);
  }
  summary.patients=patients.size;
  const cases:BillingQuarterCase[]=[];
  patients.forEach(patient=>{
    const ready=patient.positions>0&&!patient.blocked&&patient.approved===patient.positions;
    if(ready)summary.readyPatients++;
    else summary.blockedPatients++;
    cases.push({...patient,ready});
  });
  return {...summary,cases};
}

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
