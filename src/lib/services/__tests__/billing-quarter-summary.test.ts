import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { summarizeBillingQuarter, type BillingRecord, type BillingVersion } from '../../billing-workspace';

test('quarter reconciliation exposes missing work and marks only complete patients ready',()=>{
  const patientA=randomUUID(),patientB=randomUUID(),patientC=randomUUID();
  const entryA={id:randomUUID(),patient_id:patientA,version:1,termin_datum:'2026-08-01',status:'bestaetigt' as const,bestaetigt_am:'2026-08-01T10:00:00Z',positionen:[{code:'BEMA 126a',text:'A1',anzahl:1},{code:'BEMA 126b',text:'A2',anzahl:1}]};
  const entryB={id:randomUUID(),patient_id:patientB,version:1,termin_datum:'2026-08-02',status:'bestaetigt' as const,bestaetigt_am:'2026-08-02T10:00:00Z',positionen:[{code:'GOZ 6100',text:'B1',anzahl:2}]};
  const entryC={id:randomUUID(),patient_id:patientC,version:1,termin_datum:'2026-08-03',status:'bestaetigt' as const,bestaetigt_am:'2026-08-03T10:00:00Z',positionen:[]};
  const make=(entry:typeof entryA|typeof entryB,index:number,gross:number)=>{
    const recordId=randomUUID(),versionId=randomUUID();
    const line=entry.positionen[index];
    const record={id:recordId,kind:'service' as const,patient_id:entry.patient_id,head_version:1,source_record_id:entry.id,source_position_index:index};
    const version={id:versionId,record_id:recordId,revision:1,state:'approved' as const,tariff_version_id:randomUUID(),gross_cents:gross,reason:'review',created_at:'2026-08-04T10:00:00Z',created_by:randomUUID(),decided_at:'2026-08-04T11:00:00Z',decided_by:randomUUID(),decision_reason:'approved',data:{patientId:entry.patient_id,serviceDate:entry.termin_datum,schedule:line.code.startsWith('GOZ')?'GOZ':'BEMA',code:line.code.split(' ')[1],description:line.text,quantity:line.anzahl,region:null,factor:line.code.startsWith('GOZ')?'2.3':null,justification:null,insurerId:line.code.startsWith('GOZ')?null:'test',tariffVersionId:randomUUID(),source:{system:'scribe',recordId:entry.id,version:entry.version,positionIndex:index}}};
    return {record,version};
  };
  const first=make(entryA,0,1200),second=make(entryB,0,3400);
  const result=summarizeBillingQuarter([entryA,entryB,entryC] as any,[first.record,second.record] as Array<BillingRecord&{source_record_id:string;source_position_index:number}>,[first.version,second.version] as BillingVersion[]);
  assert.equal(result.confirmedEntries,3);assert.equal(result.sourcePositions,3);assert.equal(result.entriesWithoutPositions,1);
  assert.equal(result.approvedPositions,2);assert.equal(result.missingPositions,1);assert.equal(result.approvedGrossCents,4600);
  assert.equal(result.patients,3);assert.equal(result.readyPatients,1);assert.equal(result.blockedPatients,2);
});
