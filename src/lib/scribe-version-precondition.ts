/** Optional for legacy callers; clarification always sends both preconditions. */
export function versionPrecondition(body:{expected_version?:unknown;patient_id?:unknown},entry:{version:number;patient_id:string;status:string}){
 if(entry.status==='verworfen')return 'discarded';
 if(body.patient_id!==undefined&&body.patient_id!==entry.patient_id)return 'patient';
 if(body.expected_version!==undefined&&(!Number.isInteger(body.expected_version)||body.expected_version!==entry.version))return 'version';
 return null;
}
