// Deterministic scheduler; no model calls. Existing broad refresh windows remain.
export function patientSyncMode(now:Date):'full'|'discover'{
 // Scheduled invocations may start a few minutes after the hour. Every cron
 // invocation in the first quarter-hour of a full window still refreshes existing patients.
 return now.getUTCMinutes()<15&&[4,7,10,13,16].includes(now.getUTCHours())?'full':'discover';
}
export function isPatientSyncCron(request:Request,secret:string|undefined){
 return !!secret&&request.headers.get('authorization')===`Bearer ${secret}`;
}

export function discoveryRows<T extends {ivoris_id:string}>(rows:T[],known:Set<string>,aliases:Set<string>){
 return rows.filter(row=>!known.has(row.ivoris_id)&&!aliases.has(row.ivoris_id));
}
